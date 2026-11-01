-- YugabyteDB YSQL schema. Canonical game rules remain in GameSession; these
-- tables store validated events, snapshots and lineage only.
CREATE TABLE IF NOT EXISTS game_sessions (
  session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_branches (
  session_id TEXT NOT NULL REFERENCES game_sessions(session_id),
  branch_id TEXT NOT NULL,
  parent_branch_id TEXT,
  fork_event_id TEXT,
  branch_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, branch_id)
);

CREATE TABLE IF NOT EXISTS game_events (
  session_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  sequence_no BIGINT NOT NULL,
  state_version BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  event_json JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, event_id),
  UNIQUE (session_id, idempotency_key),
  UNIQUE (session_id, branch_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS branch_snapshots (
  session_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  state_version BIGINT NOT NULL,
  state_hash TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, branch_id, state_version)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
