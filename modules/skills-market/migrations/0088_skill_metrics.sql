CREATE TABLE IF NOT EXISTS skill_metrics (
  skill_id text PRIMARY KEY REFERENCES skill_catalog(id) ON DELETE CASCADE,
  data jsonb NOT NULL
);
