import type Database from "better-sqlite3";

import sampleAssignment from "../../../../docs/technical/fixtures/audio-visual/sample-assignment.json";

interface DemoHousehelpIds {
  assignment: string;
  househelp: string;
  recipeVersion: string;
}

const SEEDED_AT = "2026-08-30T06:00:00.000Z";

export function seedHousehelpDemoData(
  client: Database.Database,
  ids: DemoHousehelpIds,
): void {
  const snapshot = structuredClone(sampleAssignment);
  snapshot.assignment.id = ids.assignment;
  snapshot.assignment.assigneeId = ids.househelp;
  snapshot.assignment.recipeVersionId = ids.recipeVersion;
  snapshot.assignment.status = "scheduled";
  snapshot.recipe.versionId = ids.recipeVersion;

  const session = client
    .prepare("SELECT id FROM househelp_cooking_sessions WHERE assignment_id = ?")
    .get(ids.assignment) as { id: string } | undefined;
  if (session) {
    client.prepare("DELETE FROM househelp_ingredient_decisions WHERE session_id = ?").run(session.id);
    client.prepare("DELETE FROM househelp_step_progress WHERE session_id = ?").run(session.id);
    client.prepare("DELETE FROM househelp_timers WHERE session_id = ?").run(session.id);
  }
  client.prepare("DELETE FROM househelp_issues WHERE assignment_id = ?").run(ids.assignment);
  client.prepare("DELETE FROM househelp_idempotency_keys WHERE assignment_id = ?").run(ids.assignment);
  client.prepare("DELETE FROM househelp_cooking_sessions WHERE assignment_id = ?").run(ids.assignment);

  const upsert = client.prepare(
    `INSERT INTO househelp_assignment_snapshots
       (assignment_id, recipe_version_id, locale, snapshot_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(assignment_id, locale) DO UPDATE SET
       recipe_version_id = excluded.recipe_version_id,
       snapshot_json = excluded.snapshot_json,
       updated_at = excluded.updated_at`,
  );
  for (const locale of ["en-IN", "hi-IN"]) {
    upsert.run(
      ids.assignment,
      ids.recipeVersion,
      locale,
      JSON.stringify(snapshot),
      SEEDED_AT,
      SEEDED_AT,
    );
  }
}
