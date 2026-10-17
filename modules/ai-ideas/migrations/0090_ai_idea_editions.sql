CREATE TABLE IF NOT EXISTS ai_idea_editions (
  date text PRIMARY KEY CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'empty', 'failed')),
  ideas jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_hash text,
  source_count integer NOT NULL DEFAULT 0,
  receipt_id bigint,
  error text,
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
