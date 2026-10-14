CREATE TABLE IF NOT EXISTS ai_tool_snapshots (
  key text PRIMARY KEY,
  source_url text NOT NULL,
  data jsonb,
  etag text,
  last_attempt_at timestamptz,
  checked_at timestamptz,
  changed_at timestamptz,
  next_fetch_at timestamptz,
  error text
);
