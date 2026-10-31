# Persistence Architecture — The Last Blink: Second Settlement

- Status: Accepted & Verified (Stage 10)
- Authors: Senior Principal Engineer & System Architect
- Version: 1.0.0
- Date: 2026-10-31

---

## 1. Architectural Philosophy & Constraints

1. **Deterministic Authority**: `DeterministicGameSession` is the single source of truth for canonical state. Persistence is an asynchronous, append-only or versioned projection boundary. Persistence never invents or validates gameplay logic; it faithfully preserves and restores canonical state envelopes, timeline snapshots, and immutable event streams.
2. **Offline-First & Local Sovereignty**: The browser game must be fully playable and resilient without external network access or remote servers. Local IndexedDB storage provides durable persistence across browser refreshes and tab closures. External databases (such as YugabyteDB in Stage 12+) serve as server-side, multi-client audit and memory backends, not synchronous per-frame gameplay dependencies.
3. **Atomic Transaction Isolation**: A save transaction must be all-or-nothing. If a browser crash, quota exhaustion, or validation failure interrupts a write, no partial state is ever exposed as a valid checkpoint.
4. **BLINK Timeline Isolation Preserved Across Restore**: A save cannot flatten timelines into a single history. Timeline ancestry, anchor checkpoints, parent-child fork relations, and branch-specific event lineage must be fully preserved across reload.

---

## 2. Storage Topology

The local storage layer operates over standard browser **IndexedDB**:

- **Database Name**: `the_last_blink_db`
- **Schema Version**: `1`

### 2.1 Object Stores & Keys

| Store Name | Primary Key | Key Type | Indices | Content / Schema |
| :--- | :--- | :--- | :--- | :--- |
| `envelopes` | `sessionId` | String | `by_savedAt` (`savedAt`) | Frozen `SaveEnvelope` (v1): envelope metadata, checksum, state hash, contract versions, payload `GameState`. |
| `events` | `[sessionId, eventId]` | Compound | `by_session_branch` (`[sessionId, branchId, sequenceNo]`), `by_session_seq` (`[sessionId, sequenceNo]`) | Canonical `GameEvent` logs, tagged with branch coordinates, sequence numbers, and timestamps. |
| `branch_snapshots` | `[sessionId, branchId]` | Compound | — | Full `GameState` snapshot for each branch runtime, version, and canonical hash. |
| `session_meta` | `sessionId` | String | — | Fast session overview: `activeBranchId`, `saveId`, `stateVersion`, `stateHash`, `savedAt`, `gameVersion`, `contentId`. |

---

## 3. Transaction Integrity & Flow

```
                  +-----------------------------------+
                  |     DeterministicGameSession      |
                  +-----------------------------------+
                                    |
                           session.save()
                                    v
                 +--------------------------------------+
                 |      saveEnvelopeSchema.parse()       |
                 |      hashCanonical(payload) check    |
                 |      saveChecksum() validation       |
                 +--------------------------------------+
                                    |
                        persistence.saveSession()
                                    v
       ================== ATOMIC IDB TRANSACTION ==================
       |  1. envelopes.put(envelope)                              |
       |  2. events.put(eventRows...)                             |
       |  3. branch_snapshots.put(branchSnapshots...)             |
       |  4. session_meta.put(sessionMeta)                        |
       |  --> oncomplete: commit all writes                       |
       |  --> onabort / onerror: roll back completely             |
       ============================================================
```

### 3.1 Write Verification
Before any record reaches storage, the payload is verified:
1. `saveEnvelopeSchema.parse(envelope)` ensures contract validity.
2. `hashCanonical(envelope.payload) === envelope.engineStateHash` guarantees state snapshot integrity.
3. `hashCanonical(withoutChecksum) === envelope.checksum` protects against payload tampering or data corruption.

### 3.2 Abort & Failure Guarantees
- An IDB transaction covering `['envelopes', 'events', 'branch_snapshots', 'session_meta']` in `'readwrite'` mode rolls back completely on abort.
- If storage quota is exceeded, `QuotaExceededError` is thrown without altering previously committed save states.
- If storage is unavailable (e.g. strict private browsing or disabled cookies), `PersistenceUnavailableError` is surfaced, allowing graceful fallback to in-memory mode.

---

## 4. Multi-Branch Restoration Invariant

When `DeterministicGameSession.restore()` is executed:
1. The active `SaveEnvelope` is loaded and cryptographically verified.
2. If `loadSession()` is supported, all branch snapshots and event streams for `sessionId` are retrieved.
3. Each branch in `state.branches` is reconstituted as an independent `BranchRuntime`:
   - Parent branch history is re-anchored.
   - Child branch events post-fork remain strictly isolated from parent.
   - Active branch pointer is set to the saved active timeline.
4. Subsequent calls to `switchBranch(v1Id)` or `switchBranch(v2Id)` execute deterministically without re-querying persistence.

---

## 5. UI Integration

The `Ledger` component and the HUD provide deterministic persistence status:
- `idle`: Persistence configured and ready.
- `saving`: Transaction active in IndexedDB.
- `saved`: Transaction successfully committed with save ID and timestamp.
- `restored`: Session reconstructed from local IndexedDB.
- `error`: Clear error notification with failure code; canonical game state in memory remains uncorrupted.
