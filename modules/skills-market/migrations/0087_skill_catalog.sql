CREATE TABLE IF NOT EXISTS skill_catalog (
  id text PRIMARY KEY,
  repo text NOT NULL,
  skill_path text NOT NULL,
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo, skill_path)
);
