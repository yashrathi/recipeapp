import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

import type { HouseholdActor } from "@/server/auth/policy";
import { authorize } from "@/server/auth/policy";

import type { AssignmentSnapshot, PersistedHousehelpProgress } from "../types";
import type { HousehelpMutation } from "./contracts";

interface AssignmentRow {
  id: string;
  household_id: string;
  assignee_id: string;
  recipe_version_id: string;
  selected_locale: "en-IN" | "hi-IN";
  status: string;
}

interface SessionRow {
  id: string;
  assignment_id: string;
  recipe_version_id: string;
  locale: "en-IN" | "hi-IN";
  current_view: PersistedHousehelpProgress["view"];
  ingredient_index: number;
  step_index: number;
  status: string;
  revision: number;
  finished_at: string | null;
}

interface SnapshotRow {
  recipe_version_id: string;
  snapshot_json: string;
}

export class HousehelpAccessError extends Error {
  constructor(
    readonly status: 401 | 403 | 404 | 409 | 410,
    message: string,
  ) {
    super(message);
    this.name = "HousehelpAccessError";
  }
}

export interface HousehelpAssignmentData {
  snapshot: AssignmentSnapshot;
  progress: PersistedHousehelpProgress | null;
}

export class HousehelpRepository {
  constructor(private readonly client: Database.Database) {}

  listVisible(actor: HouseholdActor): Array<{
    id: string;
    recipeVersionId: string;
    locale: "en-IN" | "hi-IN";
    status: string;
  }> {
    if (actor.role !== "househelp") throw new HousehelpAccessError(403, "Househelp access required.");
    return this.client
      .prepare(
        `SELECT id, recipe_version_id, selected_locale, status
         FROM cooking_assignments
         WHERE household_id = ? AND assignee_id = ?
           AND status NOT IN ('cancelled', 'reassigned')
         ORDER BY scheduled_date, target_time`,
      )
      .all(actor.householdId, actor.userId)
      .map((row) => {
        const typed = row as Omit<AssignmentRow, "household_id" | "assignee_id">;
        return {
          id: typed.id,
          recipeVersionId: typed.recipe_version_id,
          locale: typed.selected_locale,
          status: typed.status,
        };
      });
  }

  getVisible(actor: HouseholdActor, assignmentId?: string): HousehelpAssignmentData | null {
    if (actor.role !== "househelp") throw new HousehelpAccessError(403, "Househelp access required.");
    const assignment = assignmentId
      ? this.findAssignment(actor, assignmentId)
      : this.findNextAssignment(actor);
    if (!assignment) return null;
    if (["cancelled", "reassigned"].includes(assignment.status)) {
      throw new HousehelpAccessError(410, "This cooking task is no longer available.");
    }
    authorize(actor, "assignment:view", {
      householdId: assignment.household_id,
      assigneeId: assignment.assignee_id,
    });

    const snapshot = this.validatePinnedSnapshot(assignment, assignment.selected_locale);
    return { snapshot, progress: this.getProgress(assignment.id, snapshot) };
  }

  mutate(
    actor: HouseholdActor,
    assignmentId: string,
    mutation: HousehelpMutation,
    now = new Date(),
  ): HousehelpAssignmentData {
    if (actor.role !== "househelp") throw new HousehelpAccessError(403, "Househelp access required.");
    const timestamp = now.toISOString();

    this.client.transaction(() => {
      const assignment = this.findAssignment(actor, assignmentId);
      if (!assignment) throw new HousehelpAccessError(404, "Cooking task not found.");
      if (["cancelled", "reassigned"].includes(assignment.status)) {
        throw new HousehelpAccessError(410, "This cooking task is no longer available.");
      }
      authorize(actor, mutation.type === "issue" ? "issue:report" : "cooking:progress", {
        householdId: assignment.household_id,
        assigneeId: assignment.assignee_id,
      });

      if (mutation.type === "locale") {
        this.validatePinnedSnapshot(assignment, mutation.locale);
        this.client.prepare("UPDATE users SET spoken_locale = ? WHERE id = ?").run(
          mutation.locale,
          actor.userId,
        );
        this.client.prepare("UPDATE cooking_assignments SET selected_locale = ?, updated_at = ? WHERE id = ?")
          .run(mutation.locale, timestamp, assignmentId);
        this.client.prepare("UPDATE househelp_cooking_sessions SET locale = ?, updated_at = ? WHERE assignment_id = ?")
          .run(mutation.locale, timestamp, assignmentId);
        return;
      }

      const snapshot = this.validatePinnedSnapshot(assignment, assignment.selected_locale);
      this.validateMutationReferences(snapshot, assignmentId, mutation);

      let session = this.findSession(assignmentId);
      if (
        session &&
        (
          !Number.isInteger(session.ingredient_index) ||
          session.ingredient_index < 0 ||
          session.ingredient_index >= snapshot.recipe.ingredients.length ||
          !Number.isInteger(session.step_index) ||
          session.step_index < 0 ||
          session.step_index >= snapshot.recipe.steps.length
        )
      ) {
        throw new HousehelpAccessError(409, "The saved progress indexes do not match the pinned assignment snapshot.");
      }
      const idempotencyKey = "idempotencyKey" in mutation ? mutation.idempotencyKey : undefined;
      if (idempotencyKey && this.hasIdempotencyKey(assignmentId, idempotencyKey)) return;

      if (!session && mutation.type === "start") {
        const sessionId = `househelp-session-${assignmentId}`;
        this.client.prepare(
          `INSERT INTO househelp_cooking_sessions
            (id, assignment_id, recipe_version_id, locale, current_view, ingredient_index,
             step_index, status, revision, started_at, updated_at)
           VALUES (?, ?, ?, ?, 'briefing', 0, 0, 'preparing', 0, ?, ?)`,
        ).run(
          sessionId,
          assignmentId,
          assignment.recipe_version_id,
          assignment.selected_locale,
          timestamp,
          timestamp,
        );
        this.client.prepare("UPDATE cooking_assignments SET status = 'preparing', updated_at = ? WHERE id = ?")
          .run(timestamp, assignmentId);
        session = this.findSession(assignmentId);
      }

      if (!session && mutation.type !== "issue") {
        throw new HousehelpAccessError(409, "Start the cooking task before saving progress.");
      }
      if (session && session.recipe_version_id !== assignment.recipe_version_id) {
        throw new HousehelpAccessError(409, "The cooking session does not match the pinned recipe version.");
      }
      const revision = session?.revision ?? 0;
      if (mutation.expectedRevision !== revision) {
        throw new HousehelpAccessError(409, `Progress changed from revision ${mutation.expectedRevision} to ${revision}.`);
      }

      let acceptedRevision = revision;
      switch (mutation.type) {
        case "start":
          break;
        case "ingredient": {
          const currentIngredient = snapshot.recipe.ingredients[session!.ingredient_index];
          if (!currentIngredient || currentIngredient.id !== mutation.ingredientId) {
            throw new HousehelpAccessError(409, "The ingredient is not the current item in the pinned assignment snapshot.");
          }
          const expectedIndex = Math.min(
            session!.ingredient_index + 1,
            snapshot.recipe.ingredients.length - 1,
          );
          if (mutation.ingredientIndex !== expectedIndex) {
            throw new HousehelpAccessError(409, "The ingredient index is inconsistent with saved progress.");
          }
          if (session!.status !== "preparing" || !["briefing", "ingredient"].includes(session!.current_view)) {
            throw new HousehelpAccessError(409, "Ingredient decisions are no longer available for this session.");
          }
          this.client.prepare(
            `INSERT INTO househelp_ingredient_decisions
               (session_id, ingredient_id, decision, decided_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(session_id, ingredient_id) DO UPDATE SET
               decision = excluded.decision, decided_at = excluded.decided_at`,
          ).run(session!.id, mutation.ingredientId, mutation.decision, timestamp);
          acceptedRevision = revision + 1;
          this.updateSession(session!.id, {
            currentView: "ingredient",
            ingredientIndex: mutation.ingredientIndex,
            stepIndex: session!.step_index,
            status: "preparing",
            revision: acceptedRevision,
            timestamp,
          });
          break;
        }
        case "start_cooking": {
          const finalIngredientIndex = snapshot.recipe.ingredients.length - 1;
          const decisions = this.client.prepare(
            "SELECT ingredient_id FROM househelp_ingredient_decisions WHERE session_id = ?",
          ).all(session!.id) as Array<{ ingredient_id: string }>;
          const decidedIds = new Set(decisions.map((decision) => decision.ingredient_id));
          if (
            session!.status !== "preparing" ||
            session!.ingredient_index !== finalIngredientIndex ||
            snapshot.recipe.ingredients.some((ingredient) => !decidedIds.has(ingredient.id))
          ) {
            throw new HousehelpAccessError(409, "Finish the pinned ingredient checklist before cooking.");
          }
          acceptedRevision = revision + 1;
          this.updateSession(session!.id, {
            currentView: "cook",
            ingredientIndex: session!.ingredient_index,
            stepIndex: 0,
            status: "cooking",
            revision: acceptedRevision,
            timestamp,
          });
          this.client.prepare("UPDATE cooking_assignments SET status = 'cooking', updated_at = ? WHERE id = ?")
            .run(timestamp, assignmentId);
          break;
        }
        case "step": {
          const currentStep = snapshot.recipe.steps[session!.step_index];
          if (!currentStep || currentStep.id !== mutation.stepId) {
            throw new HousehelpAccessError(409, "The submitted step is not the current step in the pinned assignment snapshot.");
          }
          const expectedIndex = Math.min(
            session!.step_index + 1,
            snapshot.recipe.steps.length - 1,
          );
          if (mutation.stepIndex !== expectedIndex) {
            throw new HousehelpAccessError(409, "The step index is inconsistent with saved progress.");
          }
          if (session!.status !== "cooking" || session!.current_view !== "cook") {
            throw new HousehelpAccessError(409, "Cooking steps are not available in the current session state.");
          }
          this.client.prepare(
            `INSERT INTO househelp_step_progress (session_id, step_id, state, completed_at)
             VALUES (?, ?, 'complete', ?)
             ON CONFLICT(session_id, step_id) DO UPDATE SET state = 'complete', completed_at = excluded.completed_at`,
          ).run(session!.id, mutation.stepId, timestamp);
          const finalStep = session!.step_index === snapshot.recipe.steps.length - 1;
          acceptedRevision = revision + 1;
          this.updateSession(session!.id, {
            currentView: finalStep ? "completion" : "cook",
            ingredientIndex: session!.ingredient_index,
            stepIndex: mutation.stepIndex,
            status: "cooking",
            revision: acceptedRevision,
            timestamp,
          });
          break;
        }
        case "issue": {
          const issueHash = createHash("sha256")
            .update(`${assignmentId}\0${mutation.idempotencyKey}`)
            .digest("hex");
          const issueId = `househelp-issue-${issueHash}`;
          this.client.prepare(
            `INSERT OR IGNORE INTO househelp_issues
               (id, assignment_id, session_id, reporter_id, issue_type, entity_id,
                idempotency_key, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
          ).run(
            issueId,
            assignmentId,
            session?.id ?? null,
            actor.userId,
            mutation.issueType,
            mutation.entityId,
            mutation.idempotencyKey,
            timestamp,
          );
          break;
        }
        case "timer": {
          const existingTimer = this.client.prepare(
            "SELECT step_id FROM househelp_timers WHERE session_id = ? AND id = ?",
          ).get(session!.id, mutation.timerId) as { step_id: string } | undefined;
          const currentStep = snapshot.recipe.steps[session!.step_index];
          if (
            (existingTimer && existingTimer.step_id !== mutation.stepId) ||
            (!existingTimer && currentStep?.id !== mutation.stepId)
          ) {
            throw new HousehelpAccessError(409, "The timer does not belong to the current saved step.");
          }
          this.client.prepare(
            `INSERT INTO househelp_timers
               (id, session_id, step_id, status, duration_seconds, ends_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(session_id, id) DO UPDATE SET
               status = excluded.status, duration_seconds = excluded.duration_seconds,
               ends_at = excluded.ends_at, updated_at = excluded.updated_at`,
          ).run(
            mutation.timerId,
            session!.id,
            mutation.stepId,
            mutation.status,
            mutation.durationSeconds,
            mutation.endsAt,
            timestamp,
          );
          break;
        }
        case "done": {
          const completedSteps = this.client.prepare(
            `SELECT step_id FROM househelp_step_progress
             WHERE session_id = ? AND state = 'complete'`,
          ).all(session!.id) as Array<{ step_id: string }>;
          const completedIds = new Set(completedSteps.map((step) => step.step_id));
          if (
            session!.current_view !== "completion" ||
            session!.status !== "cooking" ||
            snapshot.recipe.steps.some((step) => !completedIds.has(step.id))
          ) {
            throw new HousehelpAccessError(409, "Finish every pinned cooking step before completion.");
          }
          acceptedRevision = revision + 1;
          this.client.prepare(
            `UPDATE househelp_cooking_sessions
             SET current_view = 'completion', status = 'done', revision = ?,
                 finished_at = ?, updated_at = ? WHERE id = ?`,
          ).run(acceptedRevision, timestamp, timestamp, session!.id);
          this.client.prepare("UPDATE cooking_assignments SET status = 'done', updated_at = ? WHERE id = ?")
            .run(timestamp, assignmentId);
          break;
        }
      }

      if (idempotencyKey) {
        this.client.prepare(
          `INSERT INTO househelp_idempotency_keys
             (idempotency_key, assignment_id, session_id, accepted_revision, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(idempotencyKey, assignmentId, session?.id ?? null, acceptedRevision, timestamp);
      }
    })();

    const data = this.getVisible(actor, assignmentId);
    if (!data) throw new HousehelpAccessError(404, "Cooking task not found.");
    return data;
  }

  private findAssignment(actor: HouseholdActor, assignmentId: string): AssignmentRow | null {
    return (this.client.prepare(
      `SELECT a.id, a.household_id, a.assignee_id, a.recipe_version_id,
              a.selected_locale, a.status
       FROM cooking_assignments a
       WHERE a.id = ? AND a.household_id = ? AND a.assignee_id = ?`,
    ).get(assignmentId, actor.householdId, actor.userId) as AssignmentRow | undefined) ?? null;
  }

  private findNextAssignment(actor: HouseholdActor): AssignmentRow | null {
    return (this.client.prepare(
      `SELECT a.id, a.household_id, a.assignee_id, a.recipe_version_id,
              a.selected_locale, a.status
       FROM cooking_assignments a
       WHERE a.household_id = ? AND a.assignee_id = ?
         AND a.status NOT IN ('cancelled', 'reassigned', 'done')
       ORDER BY a.scheduled_date, a.target_time LIMIT 1`,
    ).get(actor.householdId, actor.userId) as AssignmentRow | undefined) ?? null;
  }

  private findSession(assignmentId: string): SessionRow | null {
    return (this.client.prepare(
      `SELECT id, assignment_id, recipe_version_id, locale, current_view,
              ingredient_index, step_index, status, revision, finished_at
       FROM househelp_cooking_sessions WHERE assignment_id = ?`,
    ).get(assignmentId) as SessionRow | undefined) ?? null;
  }

  private getProgress(
    assignmentId: string,
    snapshot: AssignmentSnapshot,
  ): PersistedHousehelpProgress | null {
    const session = this.findSession(assignmentId);
    if (!session) return null;
    const decisions = this.client.prepare(
      "SELECT ingredient_id, decision FROM househelp_ingredient_decisions WHERE session_id = ?",
    ).all(session.id) as Array<{ ingredient_id: string; decision: "have" | "missing" }>;
    const timer = this.client.prepare(
      `SELECT id, step_id, status, duration_seconds, ends_at
       FROM househelp_timers WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1`,
    ).get(session.id) as {
      id: string;
      step_id: string;
      status: "pending" | "running" | "elapsed" | "dismissed";
      duration_seconds: number;
      ends_at: string | null;
    } | undefined;
    const ingredientStates = Object.fromEntries(
      snapshot.recipe.ingredients.map((ingredient) => [ingredient.id, "unchecked"]),
    ) as PersistedHousehelpProgress["ingredientStates"];
    decisions.forEach((decision) => {
      ingredientStates[decision.ingredient_id] = decision.decision;
    });
    return {
      sessionId: session.id,
      assignmentId,
      recipeVersionId: session.recipe_version_id,
      locale: session.locale,
      view: session.current_view,
      ingredientIndex: session.ingredient_index,
      stepIndex: session.step_index,
      ingredientStates,
      timer: timer
        ? {
            timerId: timer.id,
            stepId: timer.step_id,
            status: timer.status,
            durationSeconds: timer.duration_seconds,
            endsAt: timer.ends_at,
          }
        : null,
      revision: session.revision,
      status: session.status,
      completed: session.status === "done",
    };
  }

  private hasIdempotencyKey(assignmentId: string, key: string): boolean {
    return Boolean(
      this.client.prepare(
        `SELECT 1 FROM househelp_idempotency_keys
         WHERE assignment_id = ? AND idempotency_key = ?`,
      ).get(assignmentId, key),
    );
  }

  private validatePinnedSnapshot(
    assignment: AssignmentRow,
    locale: AssignmentRow["selected_locale"],
  ): AssignmentSnapshot {
    const row = this.client.prepare(
      `SELECT recipe_version_id, snapshot_json
       FROM househelp_assignment_snapshots
       WHERE assignment_id = ? AND recipe_version_id = ? AND locale = ?`,
    ).get(assignment.id, assignment.recipe_version_id, locale) as SnapshotRow | undefined;
    if (!row) {
      throw new HousehelpAccessError(409, "The assigned guidance snapshot is not ready for this language.");
    }

    let snapshot: AssignmentSnapshot;
    try {
      snapshot = JSON.parse(row.snapshot_json) as AssignmentSnapshot;
    } catch {
      throw new HousehelpAccessError(409, "The pinned assignment snapshot is invalid.");
    }
    const ingredients = snapshot?.recipe?.ingredients;
    const steps = snapshot?.recipe?.steps;
    if (
      row.recipe_version_id !== assignment.recipe_version_id ||
      snapshot?.assignment?.id !== assignment.id ||
      snapshot?.assignment?.assigneeId !== assignment.assignee_id ||
      snapshot?.assignment?.recipeVersionId !== assignment.recipe_version_id ||
      snapshot?.recipe?.versionId !== assignment.recipe_version_id ||
      !Array.isArray(ingredients) || ingredients.length === 0 ||
      !Array.isArray(steps) || steps.length === 0 ||
      !snapshot.translations?.[locale]
    ) {
      throw new HousehelpAccessError(409, "The pinned assignment snapshot does not match.");
    }
    const ingredientIds = ingredients.map((ingredient) => ingredient.id);
    const stepIds = steps.map((step) => step.id);
    if (
      ingredientIds.some((id) => typeof id !== "string" || id.length === 0) ||
      stepIds.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(ingredientIds).size !== ingredientIds.length ||
      new Set(stepIds).size !== stepIds.length
    ) {
      throw new HousehelpAccessError(409, "The pinned assignment snapshot contains invalid entity ids.");
    }
    return snapshot;
  }

  private validateMutationReferences(
    snapshot: AssignmentSnapshot,
    assignmentId: string,
    mutation: Exclude<HousehelpMutation, { type: "locale" }>,
  ): void {
    switch (mutation.type) {
      case "ingredient":
        if (!snapshot.recipe.ingredients.some((ingredient) => ingredient.id === mutation.ingredientId)) {
          throw new HousehelpAccessError(409, "The ingredient is not in the pinned assignment snapshot.");
        }
        if (mutation.ingredientIndex >= snapshot.recipe.ingredients.length) {
          throw new HousehelpAccessError(409, "The ingredient index is outside the pinned assignment snapshot.");
        }
        return;
      case "step":
        if (!snapshot.recipe.steps.some((step) => step.id === mutation.stepId)) {
          throw new HousehelpAccessError(409, "The step is not in the pinned assignment snapshot.");
        }
        if (mutation.stepIndex >= snapshot.recipe.steps.length) {
          throw new HousehelpAccessError(409, "The step index is outside the pinned assignment snapshot.");
        }
        return;
      case "timer": {
        const timerStep = snapshot.recipe.steps.find((step) => step.id === mutation.stepId);
        if (!timerStep) {
          throw new HousehelpAccessError(409, "The timer step is not in the pinned assignment snapshot.");
        }
        if (!timerStep.timer || timerStep.timer.durationSeconds !== mutation.durationSeconds) {
          throw new HousehelpAccessError(409, "The timer duration does not match the pinned assignment snapshot.");
        }
        if (mutation.timerId !== `timer-${timerStep.id}`) {
          throw new HousehelpAccessError(409, "The timer id does not match the pinned assignment snapshot.");
        }
        return;
      }
      case "issue": {
        const ingredientEntity = snapshot.recipe.ingredients.some(
          (ingredient) => ingredient.id === mutation.entityId,
        );
        const validEntity =
          mutation.entityId === assignmentId ||
          ingredientEntity ||
          snapshot.recipe.steps.some((step) => step.id === mutation.entityId);
        if (!validEntity) {
          throw new HousehelpAccessError(409, "The issue entity is not in the pinned assignment snapshot.");
        }
        if (mutation.issueType === "ingredient_missing" && !ingredientEntity) {
          throw new HousehelpAccessError(409, "The missing ingredient is not in the pinned assignment snapshot.");
        }
        return;
      }
      default:
        return;
    }
  }

  private updateSession(
    sessionId: string,
    input: {
      currentView: string;
      ingredientIndex: number;
      stepIndex: number;
      status: string;
      revision: number;
      timestamp: string;
    },
  ) {
    this.client.prepare(
      `UPDATE househelp_cooking_sessions
       SET current_view = ?, ingredient_index = ?, step_index = ?, status = ?,
           revision = ?, updated_at = ? WHERE id = ?`,
    ).run(
      input.currentView,
      input.ingredientIndex,
      input.stepIndex,
      input.status,
      input.revision,
      input.timestamp,
      sessionId,
    );
  }
}
