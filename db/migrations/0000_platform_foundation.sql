CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  locale TEXT NOT NULL,
  spoken_locale TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  default_units TEXT NOT NULL CHECK (default_units IN ('metric', 'imperial')),
  created_at TEXT NOT NULL
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  role TEXT NOT NULL CHECK (role IN ('homeowner', 'househelp')),
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'revoked')),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX memberships_user_household_unique ON memberships(user_id, household_id);

CREATE TABLE recipe_sources (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  type TEXT NOT NULL CHECK (type IN ('web', 'youtube', 'manual')),
  canonical_url TEXT,
  title TEXT,
  author TEXT,
  attribution TEXT NOT NULL,
  fetched_at TEXT
);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  source_id TEXT NOT NULL REFERENCES recipe_sources(id),
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  extractor_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  source_id TEXT NOT NULL REFERENCES recipe_sources(id),
  current_version_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE recipe_versions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  source_id TEXT NOT NULL REFERENCES recipe_sources(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  servings REAL,
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  language TEXT NOT NULL,
  review_status TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX recipe_versions_recipe_version_unique ON recipe_versions(recipe_id, version);

CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  display_line TEXT NOT NULL,
  canonical_name TEXT,
  quantity REAL,
  unit TEXT,
  preparation_note TEXT,
  optional INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,
  confidence REAL NOT NULL,
  evidence TEXT
);

CREATE TABLE recipe_steps (
  id TEXT PRIMARY KEY,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  sort_order INTEGER NOT NULL,
  short_text TEXT NOT NULL,
  detailed_text TEXT NOT NULL,
  action TEXT,
  duration_seconds INTEGER,
  temperature_celsius INTEGER,
  ingredient_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL,
  evidence TEXT
);

CREATE TABLE spoken_guidance (
  id TEXT PRIMARY KEY,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  step_id TEXT REFERENCES recipe_steps(id),
  interface_key TEXT,
  locale TEXT NOT NULL,
  speakable_text TEXT NOT NULL,
  voice_version TEXT NOT NULL,
  generation_status TEXT NOT NULL,
  cache_key TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE visual_assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source_url TEXT,
  owner TEXT NOT NULL,
  attribution TEXT NOT NULL,
  rights_status TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  spoken_description TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id)
);

CREATE TABLE recipe_visuals (
  id TEXT PRIMARY KEY,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  ingredient_id TEXT REFERENCES recipe_ingredients(id),
  step_id TEXT REFERENCES recipe_steps(id),
  visual_asset_id TEXT NOT NULL REFERENCES visual_assets(id),
  purpose TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cooking_assignments (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  assignee_id TEXT NOT NULL REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  scheduled_date TEXT NOT NULL,
  meal_slot TEXT NOT NULL,
  target_time TEXT,
  target_servings REAL NOT NULL,
  notes TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX cooking_assignments_household_date_idx
  ON cooking_assignments(household_id, scheduled_date);
CREATE INDEX cooking_assignments_assignee_date_idx
  ON cooking_assignments(assignee_id, scheduled_date);
