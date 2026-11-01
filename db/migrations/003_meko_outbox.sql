-- Meko is supplementary and non-transactional with the canonical event store.
-- This outbox preserves failed contextual-memory deliveries for reconciliation.
CREATE TABLE IF NOT EXISTS meko_memory_outbox (
  session_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  visibility_scope TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, event_id)
);
