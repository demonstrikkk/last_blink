-- Constraints and indexes used by the repository write path.
-- 001_initial.sql is idempotent; this migration only adds access paths.
ALTER TABLE game_branches ADD COLUMN IF NOT EXISTS head_version BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_game_sessions_player_updated
  ON game_sessions (player_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_events_session_branch
  ON game_events (session_id, branch_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_branch_snapshots_session_version
  ON branch_snapshots (session_id, branch_id, state_version DESC);
