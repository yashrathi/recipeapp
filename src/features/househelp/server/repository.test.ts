import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { HouseholdActor } from "@/server/auth/policy";
import { createDatabaseHandle } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { DEMO_IDS, seedDemoData } from "@/server/db/seed";

import { HousehelpAccessError, HousehelpRepository } from "./repository";

describe("househelp server authorization and progress persistence", () => {
  let client: Database.Database;
  let repository: HousehelpRepository;
  let actor: HouseholdActor;

  beforeEach(() => {
    const handle = createDatabaseHandle(":memory:");
    client = handle.client;
    runMigrations(client);
    seedDemoData(client);
    repository = new HousehelpRepository(client);
    actor = {
      userId: DEMO_IDS.househelp,
      householdId: DEMO_IDS.household,
      membershipId: DEMO_IDS.househelpMembership,
      role: "househelp",
    };
  });

  afterEach(() => client.close());

  it("returns only the signed-in househelp's assigned and pinned bilingual snapshot", () => {
    const data = repository.getVisible(actor, DEMO_IDS.assignment);
    expect(data?.snapshot.assignment.id).toBe(DEMO_IDS.assignment);
    expect(data?.snapshot.assignment.recipeVersionId).toBe(DEMO_IDS.recipeVersion);
    expect(data?.snapshot.recipe.ingredients).toHaveLength(4);
    expect(data?.snapshot.translations["hi-IN"].dish).toBe("पालक पनीर");
    expect(repository.listVisible(actor)).toHaveLength(1);
  });

  it("denies cross-assignment reads and writes at the repository boundary", () => {
    client.prepare(
      `INSERT INTO cooking_assignments
        (id, household_id, recipe_version_id, assignee_id, created_by, scheduled_date,
         meal_slot, target_time, target_servings, selected_locale, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '2026-08-31', 'dinner', '19:00', 2, 'en-IN', NULL,
               'scheduled', '2026-08-30T06:00:00.000Z', '2026-08-30T06:00:00.000Z')`,
    ).run(
      "someone-elses-assignment",
      DEMO_IDS.household,
      DEMO_IDS.recipeVersion,
      DEMO_IDS.homeowner,
      DEMO_IDS.homeowner,
    );

    expect(repository.getVisible(actor, "someone-elses-assignment")).toBeNull();
    expect(() => repository.mutate(actor, "someone-elses-assignment", {
      type: "start",
      idempotencyKey: "cross-assignment-start",
      expectedRevision: 0,
    })).toThrowError(HousehelpAccessError);
  });

  it("persists a pinned session, ingredient decision, issue, timer and completion", () => {
    let data = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start",
      idempotencyKey: "session:start:0",
      expectedRevision: 0,
    });
    expect(data.progress).toMatchObject({
      recipeVersionId: DEMO_IDS.recipeVersion,
      revision: 0,
      status: "preparing",
    });

    data = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "ingredient",
      ingredientId: "ingredient-spinach",
      decision: "missing",
      ingredientIndex: 1,
      idempotencyKey: "session:missing:spinach:1",
      expectedRevision: 0,
    });
    expect(data.progress?.ingredientStates["ingredient-spinach"]).toBe("missing");
    expect(data.progress?.revision).toBe(1);

    repository.mutate(actor, DEMO_IDS.assignment, {
      type: "issue",
      issueType: "ingredient_missing",
      entityId: "ingredient-spinach",
      idempotencyKey: "session:missing:spinach:1:issue",
      expectedRevision: 1,
    });
    repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start_cooking",
      idempotencyKey: "session:start-cooking:2",
      expectedRevision: 1,
    });
    data = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "timer",
      timerId: "timer-step-stir",
      stepId: "step-stir",
      durationSeconds: 120,
      endsAt: "2026-08-30T07:32:00.000Z",
      status: "running",
      idempotencyKey: "session:timer:stir:2",
      expectedRevision: 2,
    });
    expect(data.progress?.timer).toMatchObject({ status: "running", durationSeconds: 120 });

    data = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "done",
      idempotencyKey: "session:done:3",
      expectedRevision: 2,
    });
    expect(data.progress).toMatchObject({ completed: true, revision: 3, status: "done" });
    const issueCount = client.prepare(
      "SELECT COUNT(*) AS count FROM househelp_issues WHERE assignment_id = ?",
    ).get(DEMO_IDS.assignment) as { count: number };
    expect(issueCount.count).toBe(1);
  });

  it("makes duplicate progress writes harmless and rejects stale revisions", () => {
    repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start",
      idempotencyKey: "session:start:0",
      expectedRevision: 0,
    });
    const first = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "ingredient",
      ingredientId: "ingredient-spinach",
      decision: "have",
      ingredientIndex: 1,
      idempotencyKey: "session:have:spinach:1",
      expectedRevision: 0,
    });
    const duplicate = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "ingredient",
      ingredientId: "ingredient-spinach",
      decision: "have",
      ingredientIndex: 1,
      idempotencyKey: "session:have:spinach:1",
      expectedRevision: 0,
    });
    expect(duplicate.progress?.revision).toBe(first.progress?.revision);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start_cooking",
      idempotencyKey: "session:start-cooking:stale",
      expectedRevision: 0,
    })).toThrowError(/Progress changed/);
  });

  it("hides recipe content immediately after assignment revocation", () => {
    client.prepare("UPDATE cooking_assignments SET status = 'cancelled' WHERE id = ?")
      .run(DEMO_IDS.assignment);
    expect(() => repository.getVisible(actor, DEMO_IDS.assignment)).toThrowError(
      /no longer available/,
    );
  });
});
