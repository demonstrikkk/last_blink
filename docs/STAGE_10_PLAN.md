# Stage 10 Plan — Durable Persistence

- Stage: 10
- Name: Durable Persistence
- Status: Planned
- Owner: Persistence Architecture Lead & Game Engine Architect
- Predecessors: Stages 0–9 verified (`11ed11fed08686a2e1a95566b8dae5ca780bfe5a`)

---

## 1. Objectives

1. Replace the ephemeral in-memory persistence (`InMemoryPersistence`) in the browser runtime with a production-grade, zero-dependency `IndexedDbPersistence` adapter implementing `PersistencePort`.
2. Persist canonical save envelopes, multi-branch snapshots, and immutable game event logs within atomic IndexedDB transactions.
3. Ensure complete BLINK timeline branch integrity across page refreshes and save/restore cycles (V1 immutability, independent V2 diverged state, branch switching without state corruption).
4. Provide robust failure handling: detect corrupted payloads, checksum mismatches, contract version drift, transaction aborts, and quota limits.
5. Upgrade the UI persistence indicator in `Ledger.tsx` and the HUD to display rich persistence status (`idle`, `saving`, `saved`, `error`, `restore_available`), save timestamps, state version, and state hashes.

---

## 2. Architecture & Data Model

### 2.1 Storage Topology

Database Name: `the_last_blink_db`  
Version: `1`

Object Stores within single atomic transaction:
1. `envelopes`
   - Primary key: `sessionId` (String)
   - Value: `SaveEnvelope` (conforms to `saveEnvelopeSchema`, format version 1)
   - Index: `by_savedAt` on `savedAt`
2. `events`
   - Primary key: `[sessionId, eventId]`
   - Value: `{ sessionId, branchId, sequenceNo, eventId, type, occurredAt, event }`
   - Index: `by_session_branch` on `[sessionId, branchId, sequenceNo]`
   - Index: `by_session_seq` on `[sessionId, sequenceNo]`
3. `branch_snapshots`
   - Primary key: `[sessionId, branchId]`
   - Value: `{ sessionId, branchId, stateVersion, stateHash, state, updatedAt }`
4. `session_meta`
   - Primary key: `sessionId`
   - Value: `{ sessionId, activeBranchId, saveId, stateVersion, stateHash, savedAt, gameVersion, contentId }`

### 2.2 Atomic Transaction Invariant

Every `save` operation opens an IDB transaction covering `['envelopes', 'events', 'branch_snapshots', 'session_meta']` in `'readwrite'` mode.
- If any operation fails or validation fails, the transaction is aborted via `transaction.abort()`.
- No partial writes are ever visible or committed.
- If IndexedDB is blocked or disabled (private browsing or quota exceeded), explicit structured errors (`PersistenceUnavailableError`, `QuotaExceededError`, `SaveTransactionError`) are surfaced to the engine and caller.

### 2.3 Multi-Branch & Event Reconstitution

In `DeterministicGameSession`:
- `save()` persists the active `SaveEnvelope` via `persistence.save(envelope)`.
- If the persistence adapter supports durable extensions (`saveSessionRecord` / `saveEvents` / `saveBranchSnapshots`), it stores all active and forked branch runtimes and all emitted events.
- `DeterministicGameSession.restore()` is extended to accept all branch states and event logs from the persistence adapter, reinstating every `BranchRuntime` in `this.runtimes`.
- Switching branches (`switchBranch`) post-restore works seamlessly because all branch runtimes are fully hydrated with their respective state histories and logs.

---

## 3. Folder & File Structure Plan

- `src/engine/session/indexedDb.ts`: The IndexedDB persistence adapter implementing `PersistencePort` and extended session persistence interfaces.
- `src/engine/session/persistenceErrors.ts`: Typed error hierarchy (`PersistenceError`, `CorruptSaveError`, `VersionMismatchError`, etc.).
- `src/engine/session/ports.ts`: Additive optional persistence capabilities on `PersistencePort`.
- `src/engine/session/gameSession.ts`: Enhanced `save()` and `restore()` supporting multi-branch runtime serialization and event hydration.
- `src/session/runtime.ts`: Browser composition root configuring `IndexedDbPersistence` with graceful fallback if IndexedDB is not supported.
- `src/ui/Ledger.tsx`: UI persistence status indicators, last save timestamp, state hash, slot info.
- `docs/PERSISTENCE_ARCHITECTURE.md`: Deep technical design of persistence and branch storage.
- `docs/adr/0018-indexeddb-durable-persistence.md`: Architectural Decision Record for IndexedDB and transactional boundaries.
- `tests/stage10Persistence.test.ts`: Exhaustive test suite covering 12 required test scenarios.

---

## 4. Test Strategy (Acceptance Matrix)

Automated Vitest tests must cover:
1. **Save and restore round-trip**: Save state and restore; canonical JSON matches exactly.
2. **Reload persistence**: Simulated page reload using fresh session instance over same DB preserves full game state.
3. **Multiple branches**: V1 forked into V2; both branches preserved across save and restore.
4. **Active branch restoration**: If V2 was active at save, V2 is active at restore; switching to V1 succeeds with exact pre-fork hash.
5. **Checkpoint restoration**: Anchor checkpoints and forked coordinates remain valid after reload.
6. **Event ordering**: Sequence numbers, event lineage, and recent events preserve deterministic ordering.
7. **Snapshot integrity**: Engine state hash and envelope checksum verified on load; mismatched checksum rejected.
8. **Duplicate save prevention**: Idempotent duplicate writes handled cleanly without corrupted history.
9. **Transaction failure handling**: Aborted transaction rolls back completely; original save remains untouched.
10. **Corruption detection**: Tampered payload or corrupt JSON in storage throws `CorruptSaveError` and does not crash engine.
11. **Schema & version validation**: Incompatible format version or contract version drift rejected with actionable diagnostics.
12. **Stage 3–9 regression coverage**: All existing 142 tests pass with 0 failures.

---

## 5. Acceptance Gate Criteria

- [ ] All 12 persistence test cases pass cleanly.
- [ ] Existing 142 tests continue to pass (total test count >= 154).
- [ ] `npm run verify` (`tsc --noEmit && vitest run && vite build`) succeeds without warning/error.
- [ ] Browser runtime starts with IndexedDB persistence and falls back safely if unavailable.
- [ ] No arbitrary UI state serialized; only canonical engine state and events.
- [ ] Documentation (`STAGE_10_PLAN.md`, `PERSISTENCE_ARCHITECTURE.md`, `ADR 0018`, `STAGE_10_REPORT.md`) fully drafted and aligned.
