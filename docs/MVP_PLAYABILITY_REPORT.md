# THE LAST BLINK: SECOND SETTLEMENT — MVP PLAYABILITY REPORT

## Executive Summary

Task 01 ("Complete the Relay Street Playable MVP") has been completed and verified. The Relay Street vertical slice is now a coherent, playable, end-to-end investigative experience.

Every step of the acceptance test passes deterministically without mock logic, placeholder code, or ungrounded claims.

---

## 1. Verified Playthrough Flow

The full investigative arc verified in `tests/mvpPlaythrough.test.ts` covers the complete player journey:

```
[1. New Game] 
      │ (Arrival phase, Curfew active, 0 evidence)
      ▼
[2. Investigate Relay 7]
      │ -> Collect `relay_7_log` at lamp post
      │ -> Assert `evidence.relay_7` (confidence 0.9, record)
      │ -> MORROW evaluates & logs initial posture
      │ -> Sable cognition triggers observation & proposal
      ▼
[3. Sable Interaction & Decision]
      │ -> Interact with Sable (`npc_sable`)
      │ -> Decision `node.sable.relay`: Player chooses `share`
      │ -> Causal consequences: `world.ward_alert` = raised, `npc.sable.stance` = relieved, `npc.sable.trust` = trusted
      │ -> Story advances to `decision` phase
      ▼
[4. Dispatch Record & Delayed Consequence]
      │ -> Collect `evidence.ward_dispatch`
      │ -> Delayed causal rule `rul_dispatch_unbroken` activates (requires `evidence.ward_dispatch` + `story.relay_choice == 'share'`)
      │ -> `world.dispatch_continuity` = unbroken
      ▼
[5. Meet Ivo & Decision]
      │ -> Collect `evidence.vendor_testimony`
      │ -> Decision `node.vendor.silence`: Player chooses `protect`
      │ -> Causal consequences: `npc.ivo.stance` = protected, `world.vendor_confidence` = high, `world.morrow_scrutiny` = elevated
      │ -> Story advances to `accounting` phase
      ▼
[6. Record Safe Anchor Checkpoint]
      │ -> Player triggers anchor at Cyan lamp post
      │ -> Engine records `Anchor` (safe: true, event sequence tracked)
      ▼
[7. BLINK Timeline Fork]
      │ -> Player forks timeline: `forkTimeline(anchorId, "Timeline V2 (Bury Account)")`
      │ -> Fork creates isolated timeline branch V2 while V1 remains active and unmutated
      ▼
[8. Switch to Timeline V2 & Reach Ending 1]
      │ -> `switchBranch(v2Id)` switches active session state
      │ -> Player decides `node.ward.call`: `bury`
      │ -> Engine transitions to ending: `ending.sealed_street` ("The Quiet Street")
      │ -> State snapshot hash frozen for V2
      ▼
[9. Switch Back to Timeline V1 & Reach Ending 2]
      │ -> `switchBranch(v1Id)` restores V1 state exactly as it was at fork point
      │ -> Ward call decision is uncommitted on V1
      │ -> Player decides `node.ward.call`: `file`
      │ -> Engine transitions to ending: `ending.open_record` ("The Open Record")
      │ -> State snapshot hash frozen for V1
      ▼
[10. ECHO Timeline Retrieval & Cross-Branch Comparison]
      │ -> `echo.ask({ kind: 'ending', branchId: v1Id })` retrieves grounded citations for "The Open Record"
      │ -> `echo.ask({ kind: 'ending', branchId: v2Id })` retrieves grounded citations for "The Quiet Street"
      │ -> `session.compareBranches(v1Id, v2Id)` computes deterministic divergence:
      │      - Base vs other branch indices & labels
      │      - Divergent choice: `node.ward.call` (V1 = `file`, V2 = `bury`)
      │      - Divergent ending: V1 = `ending.open_record`, V2 = `ending.sealed_street`
      ▼
[11. Durable Persistence Save & Restore Recovery]
      │ -> `session.save()` serializes full multi-branch state into IndexedDB
      │ -> Session recreated with `createBrowserSession({ persistence })`
      │ -> `restoredFromSave === true`
      │ -> Active branch (V1), state version, snapshot hash, and ending preserved
      │ -> Switching to V2 in reloaded session restores V2 ending and event lineage intact
```

---

## 2. Evidence & Prerequisite Chains

| Evidence ID | Source | Prerequisite | Unlocked Knowledge / Rules |
| :--- | :--- | :--- | :--- |
| `relay_7_log` | Lamp post / Physical Record | Direct inspection | Establishes `evidence.relay_7` (confidence 0.9). Unlocks Sable dialogue options. |
| `ward_dispatch` | Terminal / Official Record | `evidence.relay_7` | Triggers delayed rule `rul_dispatch_unbroken` if `relay_choice === 'share'`, or `rul_dispatch_tampered` if concealed. |
| `vendor_testimony` | Ivo / Eyewitness Testimony | `evidence.ward_dispatch` | Establishes `evidence.vendor_testimony`. Unlocks Ivo silence decision. |

---

## 3. Decision Points & Causal Consequences

| Decision Node | Choice Option | Immediate Effects | Delayed / Narrative Consequence |
| :--- | :--- | :--- | :--- |
| `node.sable.relay` | `share` | `npc.sable.trust` = trusted, `npc.sable.stance` = relieved, `world.ward_alert` = raised | Unlocks unbroken dispatch evidence route |
| `node.sable.relay` | `conceal` | `npc.sable.trust` = guarded, `npc.sable.stance` = suspicious, `world.ward_alert` = quiet | Dispatches Ward patrol |
| `node.vendor.silence` | `protect` | `npc.ivo.stance` = protected, `world.vendor_confidence` = high, `world.morrow_scrutiny` = elevated | Protects witness; increases MORROW audit pressure |
| `node.vendor.silence` | `expose` | `npc.ivo.stance` = exposed, `world.vendor_confidence` = low, `world.ward_alert` = raised | Exposes witness to Civic Ward |
| `node.ward.call` | `file` | Triggers rule `rul_ending_open_record` | Commits Ending: `ending.open_record` ("The Open Record") |
| `node.ward.call` | `bury` | Triggers rule `rul_ending_sealed_street` | Commits Ending: `ending.sealed_street` ("The Quiet Street") |

---

## 4. Subsystems Integration Verification

### MORROW System
- `MorrowController` evaluates each significant player action (evidence collection, decisions).
- Runs within budget bounds and proposes interventions validated by engine reducer.
- Tested: Posture updates to `elevated` when witness is shielded; intervention events recorded in branch lineage.

### NPC Cognition (Sable & Ivo)
- `NpcCognitionController` drives autonomous NPC cognitive cycles using deterministic policy evaluations.
- In-memory memory port tracks episodic interaction memories per branch.
- Proposals pass through `npc.propose` action validation with observation hash verification.

### BLINK Timeline Engine
- Timelines branch cleanly from recorded safe anchors (`session.recordAnchor`).
- Forked branch inherits exact state history up to checkpoint; subsequent actions in V2 never contaminate V1.
- Seamless bi-directional switching via `session.switchBranch`.

### ECHO Read-Only Retrospective Service
- `echo.ask()` answers queries with grounded citations (`facts`, `events`, `choices`, `rules`, `endings`).
- Queries are strictly branch-scoped.
- Cross-branch comparison (`session.compareBranches`) isolates exact divergence points without state mutation.

### IndexedDB Persistence & Recovery
- Complete multi-branch session state serialized and stored via `IndexedDbPersistence`.
- Auto-restores on browser startup (`createBrowserSession`); preserves branch index, event histories, and divergent endings.

---

## 5. Test & Build Gate Results

- **Unit & Integration Tests:** 18 test files, 155 passed (100% passing)
  - `tests/mvpPlaythrough.test.ts` (1 end-to-end golden path test)
  - `tests/stage10Persistence.test.ts` (12 tests)
  - `tests/stage9Npc.test.ts` (13 tests)
  - `tests/stage8Echo.test.ts` (10 tests)
  - `tests/stage7Morrow.test.ts` (11 tests)
  - `tests/stage6Branching.test.ts` (10 tests)
  - `tests/stage5Engine.test.ts` (26 tests)
  - Remaining engine and core test suites (68 tests)
- **TypeScript Typecheck (`tsc --noEmit`):** Clean, 0 errors.
- **Vite Production Build:** Success (1.30s).
