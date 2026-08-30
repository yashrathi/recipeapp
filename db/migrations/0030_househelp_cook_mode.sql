CREATE TABLE househelp_assignment_snapshots (
  assignment_id TEXT NOT NULL REFERENCES cooking_assignments(id),
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  locale TEXT NOT NULL CHECK (locale IN ('en-IN', 'hi-IN')),
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (assignment_id, locale)
);

CREATE TABLE househelp_cooking_sessions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE REFERENCES cooking_assignments(id),
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  locale TEXT NOT NULL CHECK (locale IN ('en-IN', 'hi-IN')),
  current_view TEXT NOT NULL,
  ingredient_index INTEGER NOT NULL DEFAULT 0,
  step_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('preparing', 'cooking', 'blocked', 'done')),
  revision INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE househelp_ingredient_decisions (
  session_id TEXT NOT NULL REFERENCES househelp_cooking_sessions(id),
  ingredient_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('have', 'missing')),
  decided_at TEXT NOT NULL,
  PRIMARY KEY (session_id, ingredient_id)
);

CREATE TABLE househelp_step_progress (
  session_id TEXT NOT NULL REFERENCES househelp_cooking_sessions(id),
  step_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('current', 'complete')),
  completed_at TEXT,
  PRIMARY KEY (session_id, step_id)
);

CREATE TABLE househelp_timers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES househelp_cooking_sessions(id),
  step_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'elapsed', 'dismissed')),
  duration_seconds INTEGER NOT NULL,
  ends_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE househelp_issues (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES cooking_assignments(id),
  session_id TEXT REFERENCES househelp_cooking_sessions(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  issue_type TEXT NOT NULL,
  entity_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE househelp_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES cooking_assignments(id),
  session_id TEXT REFERENCES househelp_cooking_sessions(id),
  accepted_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX househelp_snapshots_assignment_idx
  ON househelp_assignment_snapshots(assignment_id, recipe_version_id);
CREATE INDEX househelp_sessions_assignment_revision_idx
  ON househelp_cooking_sessions(assignment_id, revision);
CREATE INDEX househelp_issues_assignment_idx
  ON househelp_issues(assignment_id, status);
