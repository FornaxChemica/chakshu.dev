CREATE TABLE IF NOT EXISTS featured_projects (
  repo_name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 1,
  display_name TEXT,
  tag TEXT,
  description TEXT,
  stack_json TEXT,
  homepage_url TEXT,
  logo_url TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_featured_projects_featured_sort
  ON featured_projects(featured, sort_order);
