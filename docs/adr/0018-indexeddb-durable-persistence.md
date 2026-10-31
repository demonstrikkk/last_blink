# ADR 0018 — Durable IndexedDB Persistence & Multi-Branch Restoration

- Status: Accepted
- Date: 2026-10-31
- Owners: Persistence Architecture, Game Engine Architecture

---

## Context

In Stages 3 through 9, the game foundation used `InMemoryPersistence` to prove determinism, branching, MORROW policies, and NPC cognition offline. However, refreshing the browser discarded all session progress.

For Stage 10, browser persistence must become durable. Furthermore:
1. Timeline branching (BLINK) creates multiple branch states (`V1`, `V2`, etc.) that must survive reloads without flattening timelines or losing branch isolation.
2. The game must remain playable offline without requiring a remote database or cloud provider.
3. Save writes must be atomic: a partial write or browser interruption must never leave a corrupted save envelope.

---

## Decision

1. **Implement `IndexedDbPersistence` in `src/session/indexedDb.ts`**:
   - Implements `PersistencePort` with additive `saveSession()` and `loadSession()` methods.
   - Uses native browser IndexedDB (`the_last_blink_db`, version 1).
   - Manages four stores: `envelopes`, `events`, `branch_snapshots`, and `session_meta`.
   - Executes multi-store writes inside a single atomic readwrite transaction.
2. **Deterministic Reconstitution in `DeterministicGameSession.restore()`**:
   - Reconstructs all `BranchRuntime` instances for every branch listed in `state.branches`.
   - Preserves branch ancestry, checkpoints, and immutable event streams.
3. **Purity Separation**:
   - `src/engine/` remains 100% pure TypeScript with zero browser globals or imports (`window`, `document`, `indexedDB` strictly prohibited).
   - The IndexedDB adapter lives in `src/session/indexedDb.ts` and is injected via the composition root `src/session/runtime.ts`.
4. **Lightweight Test Harness**:
   - Provided an in-memory `IDBFactory` conforming to standard IDB transaction semantics so that Node.js tests run deterministically with zero new npm dependencies.

---

## Consequences

- Sessions survive browser reloads and tab closures.
- Switching between V1 and V2 timelines post-restore works seamlessly.
- Engine purity is maintained; tests remain fast, offline, and deterministic.
- External databases (YugabyteDB in Stage 12+) will slot cleanly behind server-side persistence interfaces without affecting local client playability.
