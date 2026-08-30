ALTER TABLE import_jobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE import_jobs ADD COLUMN requested_url TEXT;
ALTER TABLE import_jobs ADD COLUMN normalized_request_url TEXT;
ALTER TABLE import_jobs ADD COLUMN final_url TEXT;
ALTER TABLE import_jobs ADD COLUMN redirect_count INTEGER;
ALTER TABLE import_jobs ADD COLUMN response_media_type TEXT;
ALTER TABLE import_jobs ADD COLUMN fetched_at TEXT;
ALTER TABLE import_jobs ADD COLUMN content_sha256 TEXT;
ALTER TABLE import_jobs ADD COLUMN attempt_identity TEXT;
ALTER TABLE import_jobs ADD COLUMN result_json TEXT;
ALTER TABLE import_jobs ADD COLUMN recipe_id TEXT REFERENCES recipes(id);
ALTER TABLE import_jobs ADD COLUMN recipe_version_id TEXT REFERENCES recipe_versions(id);

CREATE UNIQUE INDEX import_jobs_idempotency_scope_unique
  ON import_jobs(household_id, created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX import_jobs_household_id_idx ON import_jobs(household_id, id);

CREATE TABLE import_attempt_results (
  attempt_identity TEXT PRIMARY KEY,
  contract_version TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  normalized_final_url TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
