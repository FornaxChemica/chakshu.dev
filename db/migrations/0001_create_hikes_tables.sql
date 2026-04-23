PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hikes (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  alltrails_url TEXT,
  location TEXT NOT NULL,
  date TEXT NOT NULL,
  distance TEXT NOT NULL,
  elevation_gain TEXT NOT NULL,
  high_point TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  gpx_path TEXT NOT NULL,
  trail_json TEXT NOT NULL,
  elevation_ft_json TEXT NOT NULL,
  raw_points_json TEXT NOT NULL,
  bounds_json TEXT NOT NULL,
  elevation_min REAL NOT NULL DEFAULT 0,
  elevation_max REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hike_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  at REAL NOT NULL DEFAULT 0,
  src_path TEXT NOT NULL,
  caption TEXT NOT NULL,
  elevation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hike_id) REFERENCES hikes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hikes_published_sort ON hikes(published, sort_order);
CREATE INDEX IF NOT EXISTS idx_snapshots_hike_sort ON snapshots(hike_id, sort_order);
