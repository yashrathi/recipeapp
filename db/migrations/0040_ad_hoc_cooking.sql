ALTER TABLE cooking_assignments
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'scheduled'
  CHECK (origin IN ('scheduled', 'ad_hoc'));

CREATE INDEX cooking_assignments_origin_idx
  ON cooking_assignments(household_id, assignee_id, origin, status);
