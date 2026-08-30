import type Database from "better-sqlite3";
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
    expect(recipe?.ingredients[0]?.displayLine).toBe("1 cup spinach, washed");
    expect(recipe?.steps[1]?.ingredientIds).toEqual([DEMO_IDS.ingredientSpinach]);
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
