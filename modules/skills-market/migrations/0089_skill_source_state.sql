CREATE TABLE IF NOT EXISTS skill_source_state (
  repo text PRIMARY KEY,
  data jsonb,
  checked_at timestamptz,
  last_attempt_at timestamptz,
  next_fetch_at timestamptz,
  etag text,
  error text
);
