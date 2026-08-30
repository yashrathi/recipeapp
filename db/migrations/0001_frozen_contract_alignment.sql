ALTER TABLE import_jobs
  ADD COLUMN contract_version TEXT NOT NULL DEFAULT 'web-recipe-import/v1';

ALTER TABLE recipe_ingredients ADD COLUMN original_text TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_ingredients ADD COLUMN display_text TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_ingredients ADD COLUMN ingredient_text TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_ingredients ADD COLUMN quantity_json TEXT;
ALTER TABLE recipe_ingredients ADD COLUMN unit_json TEXT;
ALTER TABLE recipe_ingredients ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE recipe_steps ADD COLUMN section TEXT;
ALTER TABLE recipe_steps ADD COLUMN original_text TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_steps ADD COLUMN display_text TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_steps ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE spoken_guidance ADD COLUMN guidance_key TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE spoken_guidance ADD COLUMN content_hash TEXT NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE spoken_guidance ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE spoken_guidance ADD COLUMN audio_asset_id TEXT;
ALTER TABLE spoken_guidance ADD COLUMN cache_status TEXT NOT NULL DEFAULT 'not_cached';
CREATE UNIQUE INDEX spoken_guidance_content_identity_unique
  ON spoken_guidance(recipe_version_id, guidance_key, locale, content_hash, voice_version);

ALTER TABLE visual_assets ADD COLUMN kind TEXT NOT NULL DEFAULT 'state_icon';
ALTER TABLE visual_assets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'show_state';
ALTER TABLE visual_assets ADD COLUMN verification TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE visual_assets ADD COLUMN rights TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE visual_assets ADD COLUMN content_hash TEXT NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE visual_assets ADD COLUMN asset_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE visual_assets ADD COLUMN accessible_name_message_id TEXT;
ALTER TABLE visual_assets ADD COLUMN spoken_description_message_id TEXT;

CREATE TABLE audio_readiness (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES cooking_assignments(id),
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  locale TEXT NOT NULL,
  snapshot_content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  required_guidance_count INTEGER NOT NULL,
  cached_audio_count INTEGER NOT NULL,
  compatible_device_voice INTEGER NOT NULL,
  reviewed_text_stored INTEGER NOT NULL,
  recipe_snapshot_stored INTEGER NOT NULL,
  visual_metadata_stored INTEGER NOT NULL,
  checked_at TEXT NOT NULL,
  failure_reason TEXT
);
CREATE UNIQUE INDEX audio_readiness_assignment_locale_unique
  ON audio_readiness(assignment_id, locale);
