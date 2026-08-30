import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseHandle } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { DEMO_IDS, seedDemoData } from "@/server/db/seed";
import { createSqliteRepositories } from "@/server/repositories/sqlite";

describe("SQLite repositories and seed", () => {
  let client: Database.Database;
  let repositories: ReturnType<typeof createSqliteRepositories>;

  beforeEach(() => {
    const handle = createDatabaseHandle(":memory:");
    client = handle.client;
    runMigrations(client);
    seedDemoData(client);
    repositories = createSqliteRepositories(handle.orm);
  });

  afterEach(() => client.close());

  it("seeds deterministic records idempotently", () => {
    seedDemoData(client);
    const row = client.prepare("SELECT COUNT(*) AS count FROM cooking_assignments").get() as {
      count: number;
    };
    expect(row.count).toBe(1);
  });

  it("resolves active household memberships as actors", async () => {
    await expect(
      repositories.identities.findActor(DEMO_IDS.househelp, DEMO_IDS.household),
    ).resolves.toMatchObject({ role: "househelp", userId: DEMO_IDS.househelp });
    await expect(
      repositories.identities.findActor("unknown-user", DEMO_IDS.household),
    ).resolves.toBeNull();
  });

  it("rebuilds a versioned recipe without losing original ingredient lines", async () => {
    const recipe = await repositories.recipes.findVersion(DEMO_IDS.recipeVersion);
    expect(recipe?.ingredients[0]?.originalText).toBe("1/2 cup spinach, washed");
    expect(recipe?.steps[1]?.ingredientIds).toEqual([DEMO_IDS.ingredientSpinach]);
  });

  it("round-trips an exact one-half fraction without floating-point conversion", async () => {
    const recipe = await repositories.recipes.findVersion(DEMO_IDS.recipeVersion);
    expect(recipe?.ingredients[0]?.quantity).toEqual({
      kind: "exact",
      numerator: 1,
      denominator: 2,
      sourceText: "1/2",
      confidence: 1,
    });

    const stored = client
      .prepare("SELECT quantity_json FROM recipe_ingredients WHERE id = ?")
      .get(DEMO_IDS.ingredientSpinach) as { quantity_json: string };
    expect(stored.quantity_json).toContain('"numerator":1');
    expect(stored.quantity_json).not.toContain("0.5");
  });

  it("persists approved visual, guidance and snapshot cache identity", () => {
    const guidance = client
      .prepare(
        `SELECT guidance_key, locale, content_hash, voice_version, review_status, cache_status
         FROM spoken_guidance WHERE id = ?`,
      )
      .get(DEMO_IDS.guidance);
    expect(guidance).toMatchObject({
      guidance_key: `cook.step.${DEMO_IDS.stepAdd}`,
      locale: "en-IN",
      content_hash: createHash("sha256")
        .update("Now add half a cup of spinach.", "utf8")
        .digest("hex"),
      voice_version: "fixture-v1",
      review_status: "reviewed",
      cache_status: "cached",
    });

    const visual = client
      .prepare("SELECT kind, purpose, verification, rights, asset_version FROM visual_assets WHERE id = ?")
      .get(DEMO_IDS.visual);
    expect(visual).toMatchObject({
      kind: "state_icon",
      purpose: "show_state",
      verification: "approved",
      rights: "bundled",
      asset_version: "fixture-v1",
    });

    const readiness = client
      .prepare(
        "SELECT recipe_version_id, snapshot_content_hash, status FROM audio_readiness WHERE id = ?",
      )
      .get(DEMO_IDS.audioReadiness);
    expect(readiness).toMatchObject({
      recipe_version_id: DEMO_IDS.recipeVersion,
      status: "ready_cached_audio",
    });
  });

  it("lists an assignee's household work through the repository boundary", async () => {
    const actor = await repositories.identities.findActor(
      DEMO_IDS.househelp,
      DEMO_IDS.household,
    );
    expect(actor).not.toBeNull();
    await expect(repositories.assignments.listVisibleTo(actor!)).resolves.toHaveLength(1);
  });
});
