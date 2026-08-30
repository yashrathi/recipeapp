import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ImportPipelineError, sha256 } from "@/domain/import/types";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { createDatabaseHandle } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { DEMO_IDS, seedDemoData } from "@/server/db/seed";
import { SafePageFetcher, type HttpTransport } from "@/server/import/fetch";
import { createImportHttpHandlers } from "@/server/import/http";
import {
  WebRecipeImportPipeline,
  type RecipePageFetcher,
} from "@/server/import/pipeline";
import { ImportRepository } from "@/server/import/repository";
import { ImportService } from "@/server/import/service";

const SOURCE_URL = "https://recipes.example.test/basic";
const fixtureBody = readFileSync(
  join(process.cwd(), "test/fixtures/recipe-import/success-basic.html"),
);

function sessionCookie(
  userId: string,
  householdId: string,
  membershipId: string,
  role: "homeowner" | "househelp",
): string {
  const token = createSessionToken({
    userId,
    householdId,
    membershipId,
    role,
    expiresAt: Date.now() + 60_000,
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function postRequest(cookie: string, url = SOURCE_URL, key = "fixture-import-1"): Request {
  return new Request("http://app.test/api/imports", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify({ url }),
  });
}

describe("import API authorization, persistence and idempotency", () => {
  let client: Database.Database;
  let requests: number;
  let handlers: ReturnType<typeof createImportHttpHandlers>;
  let homeownerCookie: string;
  let househelpCookie: string;
  let outsiderCookie: string;

  beforeEach(() => {
    const database = createDatabaseHandle(":memory:");
    client = database.client;
    runMigrations(client);
    seedDemoData(client);
    requests = 0;
    const transport: HttpTransport = {
      async request() {
        requests += 1;
        return {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          headerBytes: 128,
          body: (async function* () {
            yield fixtureBody;
          })(),
          abort() {},
        };
      },
    };
    const fetcher = new SafePageFetcher({
      resolver: { resolve: async () => ["93.184.216.34"] },
      transport,
      sleep: async () => {},
    });
    const service = new ImportService(
      new ImportRepository(client),
      new WebRecipeImportPipeline(fetcher),
    );
    handlers = createImportHttpHandlers(client, service);
    homeownerCookie = sessionCookie(
      DEMO_IDS.homeowner,
      DEMO_IDS.household,
      DEMO_IDS.homeownerMembership,
      "homeowner",
    );
    househelpCookie = sessionCookie(
      DEMO_IDS.househelp,
      DEMO_IDS.household,
      DEMO_IDS.househelpMembership,
      "househelp",
    );

    client
      .prepare("INSERT INTO households (id, name, timezone, default_units, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("other-household", "Other", "Asia/Kolkata", "metric", new Date().toISOString());
    client
      .prepare("INSERT INTO users (id, name, locale, spoken_locale, timezone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("other-homeowner", "Other owner", "en-IN", "en-IN", "Asia/Kolkata", "active", new Date().toISOString());
    client
      .prepare("INSERT INTO memberships (id, user_id, household_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("other-membership", "other-homeowner", "other-household", "homeowner", "active", new Date().toISOString());
    outsiderCookie = sessionCookie(
      "other-homeowner",
      "other-household",
      "other-membership",
      "homeowner",
    );
  });

  afterEach(() => client.close());

  it("creates one persistent draft and returns it for the same idempotency key", async () => {
    const created = await handlers.post(postRequest(homeownerCookie));
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { id: string; recipeId: string; recipeVersionId: string; result: { status: string } };
      reused: boolean;
    };
    expect(createdBody).toMatchObject({
      reused: false,
      data: { result: { status: "success" } },
    });
    expect(createdBody.data.recipeId).toBeTruthy();
    expect(createdBody.data.recipeVersionId).toBeTruthy();

    const repeated = await handlers.post(postRequest(homeownerCookie));
    expect(repeated.status).toBe(200);
    const repeatedBody = (await repeated.json()) as typeof createdBody;
    expect(repeatedBody).toMatchObject({ reused: true, data: { id: createdBody.data.id } });
    expect(requests).toBe(1);
    expect(
      (client.prepare("SELECT COUNT(*) AS count FROM import_jobs").get() as { count: number }).count,
    ).toBe(1);
    expect(
      (client.prepare("SELECT COUNT(*) AS count FROM recipes WHERE source_id != ?").get(DEMO_IDS.source) as { count: number }).count,
    ).toBe(1);
  });

  it("persists Firecrawl as the retrieval provider after a safe direct-fetch failure", async () => {
    const direct: RecipePageFetcher = {
      async fetch() {
        throw new ImportPipelineError("FETCH_CLIENT_ERROR", "fetch", false);
      },
    };
    const fallback: RecipePageFetcher = {
      async fetch(requestedUrl) {
        return {
          requestedUrl,
          finalUrl: requestedUrl,
          redirectCount: 0,
          responseMediaType: "text/html",
          fetchedAt: "2026-08-30T10:00:00.000Z",
          contentSha256: sha256(fixtureBody),
          html: fixtureBody.toString("utf8"),
          charsetReplacement: false,
          attemptCount: 1,
        };
      },
    };
    const fallbackHandlers = createImportHttpHandlers(
      client,
      new ImportService(
        new ImportRepository(client),
        new WebRecipeImportPipeline(direct, fallback),
      ),
    );

    const response = await fallbackHandlers.post(
      postRequest(homeownerCookie, SOURCE_URL, "firecrawl-persistence"),
    );
    const body = (await response.json()) as {
      data: { result: { source: { retrievalProvider?: string } } };
    };

    expect(response.status).toBe(201);
    expect(body.data.result.source.retrievalProvider).toBe("firecrawl");
    const stored = client
      .prepare("SELECT result_json FROM import_jobs WHERE idempotency_key = ?")
      .get("firecrawl-persistence") as { result_json: string };
    expect(JSON.parse(stored.result_json)).toMatchObject({
      source: { retrievalProvider: "firecrawl" },
    });
  });

  it("persists invalid-URL failures as valid canonical JSON with the direct provider", async () => {
    const response = await handlers.post(
      postRequest(homeownerCookie, "not a url", "invalid-url-persistence"),
    );
    const body = (await response.json()) as {
      data: { result: { failure: { code: string }; source: { retrievalProvider: string } } };
    };

    expect(body.data.result).toMatchObject({
      failure: { code: "URL_INVALID" },
      source: { retrievalProvider: "direct" },
    });
    const stored = client
      .prepare("SELECT result_json FROM import_jobs WHERE idempotency_key = ?")
      .get("invalid-url-persistence") as { result_json: string };
    expect(JSON.parse(stored.result_json)).toMatchObject({
      failure: { code: "URL_INVALID" },
      source: { retrievalProvider: "direct" },
    });
  });

  it("persists direct-fetch failures as valid canonical JSON without provider fallback", async () => {
    const direct: RecipePageFetcher = {
      async fetch() {
        throw new ImportPipelineError("FETCH_UPSTREAM_ERROR", "fetch", true);
      },
    };
    const directFailureHandlers = createImportHttpHandlers(
      client,
      new ImportService(
        new ImportRepository(client),
        new WebRecipeImportPipeline(direct, null),
      ),
    );

    const response = await directFailureHandlers.post(
      postRequest(homeownerCookie, SOURCE_URL, "direct-failure-persistence"),
    );
    const body = (await response.json()) as {
      data: { result: { failure: { code: string }; source: { retrievalProvider: string } } };
    };

    expect(body.data.result).toMatchObject({
      failure: { code: "FETCH_UPSTREAM_ERROR" },
      source: { retrievalProvider: "direct" },
    });
    const stored = client
      .prepare("SELECT result_json FROM import_jobs WHERE idempotency_key = ?")
      .get("direct-failure-persistence") as { result_json: string };
    expect(JSON.parse(stored.result_json)).toMatchObject({
      failure: { code: "FETCH_UPSTREAM_ERROR" },
      source: { retrievalProvider: "direct" },
    });
  });

  it("returns a stable conflict envelope when a key is reused for another URL", async () => {
    await handlers.post(postRequest(homeownerCookie));
    const conflict = await handlers.post(
      postRequest(homeownerCookie, "https://recipes.example.test/other"),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        stage: "persist",
        retryable: false,
      },
    });
    expect(requests).toBe(1);
  });

  it("denies househelp imports before the network boundary", async () => {
    const response = await handlers.post(postRequest(househelpCookie));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(requests).toBe(0);
  });

  it("allows homeowner retrieval while enforcing role and household boundaries", async () => {
    const created = await handlers.post(postRequest(homeownerCookie));
    const body = (await created.json()) as { data: { id: string } };

    const sameHousehold = await handlers.get(
      new Request(`http://app.test/api/imports/${body.data.id}`, {
        headers: { cookie: homeownerCookie },
      }),
      body.data.id,
    );
    expect(sameHousehold.status).toBe(200);

    const deniedRole = await handlers.get(
      new Request(`http://app.test/api/imports/${body.data.id}`, {
        headers: { cookie: househelpCookie },
      }),
      body.data.id,
    );
    expect(deniedRole.status).toBe(403);

    const outsideHousehold = await handlers.get(
      new Request(`http://app.test/api/imports/${body.data.id}`, {
        headers: { cookie: outsiderCookie },
      }),
      body.data.id,
    );
    expect(outsideHousehold.status).toBe(404);
    await expect(outsideHousehold.json()).resolves.toMatchObject({
      error: { code: "IMPORT_NOT_FOUND" },
    });
  });
});
