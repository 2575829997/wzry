PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL UNIQUE,
  roles_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups_history (
  id TEXT PRIMARY KEY,
  player_ids_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_groups_created_at
ON groups_history(created_at DESC);
