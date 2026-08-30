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

  function createOwnedAssignment(assignmentId: string): void {
    client.prepare(
      `INSERT INTO cooking_assignments
        (id, household_id, recipe_version_id, assignee_id, created_by, scheduled_date,
         meal_slot, target_time, target_servings, selected_locale, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '2026-09-01', 'dinner', '19:00', 2, 'en-IN', NULL,
               'scheduled', '2026-08-30T06:00:00.000Z', '2026-08-30T06:00:00.000Z')`,
    ).run(
      assignmentId,
      DEMO_IDS.household,
      DEMO_IDS.recipeVersion,
      DEMO_IDS.househelp,
      DEMO_IDS.homeowner,
    );

    const snapshots = client.prepare(
      `SELECT locale, snapshot_json FROM househelp_assignment_snapshots
       WHERE assignment_id = ? ORDER BY locale`,
    ).all(DEMO_IDS.assignment) as Array<{ locale: "en-IN" | "hi-IN"; snapshot_json: string }>;
    const insert = client.prepare(
      `INSERT INTO househelp_assignment_snapshots
         (assignment_id, recipe_version_id, locale, snapshot_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, '2026-08-30T06:00:00.000Z', '2026-08-30T06:00:00.000Z')`,
    );
    for (const row of snapshots) {
      const snapshot = JSON.parse(row.snapshot_json) as {
        assignment: { id: string };
      };
      snapshot.assignment.id = assignmentId;
      insert.run(
        assignmentId,
        DEMO_IDS.recipeVersion,
        row.locale,
        JSON.stringify(snapshot),
      );
    }
  }

  function prepareAllIngredients(assignmentId: string): number {
    repository.mutate(actor, assignmentId, {
      type: "start",
      idempotencyKey: `${assignmentId}:start`,
      expectedRevision: 0,
    });
    const ingredientIds = [
      "ingredient-spinach",
      "ingredient-tomato",
      "ingredient-paneer",
      "ingredient-chilli",
    ];
    ingredientIds.forEach((ingredientId, index) => {
      repository.mutate(actor, assignmentId, {
        type: "ingredient",
        ingredientId,
        decision: "have",
        ingredientIndex: Math.min(index + 1, ingredientIds.length - 1),
        idempotencyKey: `${assignmentId}:ingredient:${ingredientId}`,
        expectedRevision: index,
      });
    });
    repository.mutate(actor, assignmentId, {
      type: "start_cooking",
      idempotencyKey: `${assignmentId}:start-cooking`,
      expectedRevision: 4,
    });
    return 5;
  }

  function advanceToTimedStep(assignmentId: string): number {
    let revision = prepareAllIngredients(assignmentId);
    for (const [stepId, stepIndex] of [["step-wash", 1], ["step-add", 2]] as const) {
      repository.mutate(actor, assignmentId, {
        type: "step",
        stepId,
        stepIndex,
        idempotencyKey: `${assignmentId}:step:${stepId}`,
        expectedRevision: revision,
      });
      revision += 1;
    }
    return revision;
  }

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

  it("persists a pinned session, ingredient decisions, issue, timer and completion", () => {
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
    const remainingIngredients = ["ingredient-tomato", "ingredient-paneer", "ingredient-chilli"];
    remainingIngredients.forEach((ingredientId, offset) => {
      repository.mutate(actor, DEMO_IDS.assignment, {
        type: "ingredient",
        ingredientId,
        decision: "have",
        ingredientIndex: Math.min(offset + 2, 3),
        idempotencyKey: `session:have:${ingredientId}`,
        expectedRevision: offset + 1,
      });
    });
    repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start_cooking",
      idempotencyKey: "session:start-cooking:5",
      expectedRevision: 4,
    });
    for (const [stepId, stepIndex, revision] of [
      ["step-wash", 1, 5],
      ["step-add", 2, 6],
    ] as const) {
      repository.mutate(actor, DEMO_IDS.assignment, {
        type: "step",
        stepId,
        stepIndex,
        idempotencyKey: `session:step:${stepId}`,
        expectedRevision: revision,
      });
    }
    data = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "timer",
      timerId: "timer-step-stir",
      stepId: "step-stir",
      durationSeconds: 120,
      endsAt: "2026-08-30T07:32:00.000Z",
      status: "running",
      idempotencyKey: "session:timer:stir:2",
      expectedRevision: 7,
    });
    expect(data.progress?.timer).toMatchObject({ status: "running", durationSeconds: 120 });

    repository.mutate(actor, DEMO_IDS.assignment, {
      type: "step",
      stepId: "step-stir",
      stepIndex: 3,
      idempotencyKey: "session:step:stir",
      expectedRevision: 7,
    });
    repository.mutate(actor, DEMO_IDS.assignment, {
      type: "step",
      stepId: "step-serve",
      stepIndex: 3,
      idempotencyKey: "session:step:serve",
      expectedRevision: 8,
    });

    data = repository.mutate(actor, DEMO_IDS.assignment, {
      type: "done",
      idempotencyKey: "session:done:10",
      expectedRevision: 9,
    });
    expect(data.progress).toMatchObject({ completed: true, revision: 10, status: "done" });
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

  it("does not offer a completed assignment as the next cooking task", () => {
    client.prepare("UPDATE cooking_assignments SET status = 'done' WHERE id = ?")
      .run(DEMO_IDS.assignment);
    expect(repository.getVisible(actor)).toBeNull();
    expect(repository.getVisible(actor, DEMO_IDS.assignment)?.snapshot.assignment.id)
      .toBe(DEMO_IDS.assignment);
  });

  it("rejects foreign ingredient IDs and inconsistent ingredient indexes without writing", () => {
    repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start",
      idempotencyKey: "adversarial:start",
      expectedRevision: 0,
    });

    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "ingredient",
      ingredientId: "ingredient-from-another-assignment",
      decision: "have",
      ingredientIndex: 1,
      idempotencyKey: "adversarial:foreign-ingredient",
      expectedRevision: 0,
    })).toThrowError(/pinned assignment snapshot/i);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "ingredient",
      ingredientId: "ingredient-spinach",
      decision: "have",
      ingredientIndex: 3,
      idempotencyKey: "adversarial:ingredient-index",
      expectedRevision: 0,
    })).toThrowError(/ingredient index/i);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "ingredient",
      ingredientId: "ingredient-spinach",
      decision: "have",
      ingredientIndex: 99,
      idempotencyKey: "adversarial:ingredient-out-of-range",
      expectedRevision: 0,
    })).toThrowError(/ingredient index/i);

    const result = repository.getVisible(actor, DEMO_IDS.assignment);
    expect(result?.progress?.revision).toBe(0);
    expect(result?.progress?.ingredientStates["ingredient-spinach"]).toBe("unchecked");

    client.prepare(
      "UPDATE househelp_cooking_sessions SET ingredient_index = 99 WHERE assignment_id = ?",
    ).run(DEMO_IDS.assignment);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start_cooking",
      idempotencyKey: "adversarial:corrupt-saved-index",
      expectedRevision: 0,
    })).toThrowError(/saved progress indexes/i);
  });

  it("rejects foreign step IDs and indexes that could spoof final completion", () => {
    const revision = prepareAllIngredients(DEMO_IDS.assignment);

    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "step",
      stepId: "step-from-another-assignment",
      stepIndex: 1,
      idempotencyKey: "adversarial:foreign-step",
      expectedRevision: revision,
    })).toThrowError(/pinned assignment snapshot/i);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "step",
      stepId: "step-wash",
      stepIndex: 3,
      idempotencyKey: "adversarial:step-index",
      expectedRevision: revision,
    })).toThrowError(/step index/i);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "step",
      stepId: "step-wash",
      stepIndex: 99,
      idempotencyKey: "adversarial:step-out-of-range",
      expectedRevision: revision,
    })).toThrowError(/step index/i);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "step",
      stepId: "step-serve",
      stepIndex: 3,
      idempotencyKey: "adversarial:spoof-completion",
      expectedRevision: revision,
    })).toThrowError(/current step/i);

    expect(repository.getVisible(actor, DEMO_IDS.assignment)?.progress).toMatchObject({
      view: "cook",
      stepIndex: 0,
      revision,
    });
  });

  it("rejects arbitrary timer IDs, foreign timer steps, and altered durations", () => {
    const revision = advanceToTimedStep(DEMO_IDS.assignment);
    const timerMutation = {
      type: "timer" as const,
      timerId: "timer-step-stir",
      stepId: "step-stir",
      durationSeconds: 120,
      endsAt: "2026-08-30T07:32:00.000Z",
      status: "running" as const,
      expectedRevision: revision,
    };

    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      ...timerMutation,
      timerId: "guessed-timer-id",
    })).toThrowError(/timer id/i);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      ...timerMutation,
      stepId: "step-from-another-assignment",
    })).toThrowError(/pinned assignment snapshot/i);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      ...timerMutation,
      durationSeconds: 9_999,
    })).toThrowError(/timer duration/i);

    const timerCount = client.prepare("SELECT COUNT(*) AS count FROM househelp_timers")
      .get() as { count: number };
    expect(timerCount.count).toBe(0);
  });

  it("scopes identical timer IDs to their owning sessions", () => {
    const secondAssignment = "demo-assignment-two";
    createOwnedAssignment(secondAssignment);
    const firstRevision = advanceToTimedStep(DEMO_IDS.assignment);
    const secondRevision = advanceToTimedStep(secondAssignment);

    for (const [assignmentId, expectedRevision] of [
      [DEMO_IDS.assignment, firstRevision],
      [secondAssignment, secondRevision],
    ] as const) {
      repository.mutate(actor, assignmentId, {
        type: "timer",
        timerId: "timer-step-stir",
        stepId: "step-stir",
        durationSeconds: 120,
        endsAt: "2026-08-30T07:32:00.000Z",
        status: "running",
        idempotencyKey: `${assignmentId}:timer`,
        expectedRevision,
      });
    }

    const timers = client.prepare(
      `SELECT t.id, s.assignment_id
       FROM househelp_timers t JOIN househelp_cooking_sessions s ON s.id = t.session_id
       WHERE t.id = ? ORDER BY s.assignment_id`,
    ).all("timer-step-stir") as Array<{ id: string; assignment_id: string }>;
    expect(timers).toEqual([
      { id: "timer-step-stir", assignment_id: DEMO_IDS.assignment },
      { id: "timer-step-stir", assignment_id: secondAssignment },
    ]);
  });

  it("scopes idempotency and issue deduplication to each assignment", () => {
    const secondAssignment = "demo-assignment-two";
    createOwnedAssignment(secondAssignment);

    for (const assignmentId of [DEMO_IDS.assignment, secondAssignment]) {
      repository.mutate(actor, assignmentId, {
        type: "start",
        idempotencyKey: "shared-start-key",
        expectedRevision: 0,
      });
      repository.mutate(actor, assignmentId, {
        type: "issue",
        issueType: "tell_homeowner",
        entityId: assignmentId,
        idempotencyKey: "shared-issue-key",
        expectedRevision: 0,
      });
    }

    const keyCount = client.prepare(
      "SELECT COUNT(*) AS count FROM househelp_idempotency_keys WHERE idempotency_key = ?",
    ).get("shared-start-key") as { count: number };
    const issues = client.prepare(
      "SELECT assignment_id FROM househelp_issues WHERE idempotency_key = ? ORDER BY assignment_id",
    ).all("shared-issue-key") as Array<{ assignment_id: string }>;
    expect(keyCount.count).toBe(2);
    expect(issues).toEqual([
      { assignment_id: DEMO_IDS.assignment },
      { assignment_id: secondAssignment },
    ]);
  });

  it("rejects a locale switch when its pinned assignment version is unavailable", () => {
    client.prepare(
      "DELETE FROM househelp_assignment_snapshots WHERE assignment_id = ? AND locale = 'hi-IN'",
    ).run(DEMO_IDS.assignment);

    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "locale",
      locale: "hi-IN",
    })).toThrowError(/not ready/i);
    const assignment = client.prepare(
      "SELECT selected_locale FROM cooking_assignments WHERE id = ?",
    ).get(DEMO_IDS.assignment) as { selected_locale: string };
    expect(assignment.selected_locale).toBe("en-IN");
  });

  it("validates snapshot assignment and version identity at the mutation boundary", () => {
    const row = client.prepare(
      `SELECT snapshot_json FROM househelp_assignment_snapshots
       WHERE assignment_id = ? AND locale = 'en-IN'`,
    ).get(DEMO_IDS.assignment) as { snapshot_json: string };
    const originalSnapshot = JSON.parse(row.snapshot_json) as {
      assignment: { id: string; recipeVersionId: string };
      recipe: { versionId: string };
    };
    const snapshot = structuredClone(originalSnapshot);
    snapshot.assignment.id = "another-assignment";
    client.prepare(
      `UPDATE househelp_assignment_snapshots SET snapshot_json = ?
       WHERE assignment_id = ? AND locale = 'en-IN'`,
    ).run(JSON.stringify(snapshot), DEMO_IDS.assignment);

    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start",
      idempotencyKey: "adversarial:snapshot-identity",
      expectedRevision: 0,
    })).toThrowError(/snapshot does not match/i);

    snapshot.assignment.id = originalSnapshot.assignment.id;
    snapshot.assignment.recipeVersionId = "another-recipe-version";
    snapshot.recipe.versionId = "another-recipe-version";
    client.prepare(
      `UPDATE househelp_assignment_snapshots SET snapshot_json = ?
       WHERE assignment_id = ? AND locale = 'en-IN'`,
    ).run(JSON.stringify(snapshot), DEMO_IDS.assignment);
    expect(() => repository.mutate(actor, DEMO_IDS.assignment, {
      type: "start",
      idempotencyKey: "adversarial:snapshot-version",
      expectedRevision: 0,
    })).toThrowError(/snapshot does not match/i);
    expect(client.prepare(
      "SELECT COUNT(*) AS count FROM househelp_cooking_sessions WHERE assignment_id = ?",
    ).get(DEMO_IDS.assignment)).toEqual({ count: 0 });
  });
});
