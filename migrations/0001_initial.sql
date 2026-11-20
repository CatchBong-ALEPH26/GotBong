CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  cast TEXT NOT NULL,
  victim TEXT NOT NULL,
  state TEXT NOT NULL,
  remaining INTEGER NOT NULL,
  result TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  seq INTEGER PRIMARY KEY,
  game_id TEXT NOT NULL,
  id TEXT NOT NULL,
  npc TEXT NOT NULL,
  role TEXT NOT NULL,
  question TEXT NOT NULL,
  reply TEXT NOT NULL,
  emotion TEXT NOT NULL,
  attach TEXT,
  facts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS turns_game
ON turns(game_id, seq);

CREATE UNIQUE INDEX IF NOT EXISTS turns_id
ON turns(game_id, id);

CREATE TABLE IF NOT EXISTS requests (
  game_id TEXT NOT NULL,
  id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response TEXT NOT NULL,
  PRIMARY KEY (game_id, id)
);