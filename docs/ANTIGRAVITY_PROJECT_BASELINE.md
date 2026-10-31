# The Last Blink: Second Settlement — Antigravity Project Baseline

- Document version: 1.0.0
- Date: 2026-10-31
- Target environment: Google Antigravity Engineering Environment
- Base commit: `11ed11fed08686a2e1a95566b8dae5ca780bfe5a`
- Git branch: `main`
- Working tree status: clean

---

## 1. Executive Summary & Audit Verification

This baseline document audits and formalizes the technical state of **The Last Blink: Second Settlement** before commencing Stage 10 (Durable Persistence).

All prior stages (0 through 9) have been audited against the physical source code, test suites, contracts, and production builds. No claims of completion are accepted without executable verification in the local workspace.

### Audit Summary Matrix

| Stage | Name | Status | Verified Deliverable | Test Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 0** | Visual Direction | Verified | `docs/VISUAL_STYLE_GUIDE.md`, reference board, contrast audit (7.37:1 worst case) | Style compliance |
| **Stage 1** | Asset Discovery & Licensing | Verified | Kenney & Ansimuz assets, `docs/ASSET_REGISTER.csv`, strict CC0/OFL/CC-BY compliance | Asset hash integrity |
| **Stage 2** | Asset Validation & Catalogue | Verified | `tools/assets/validate/validate_assets.py`, `docs/asset_catalogue.html` | Automated asset check |
| **Stage 3** | Engineering Foundation | Verified | Deterministic TypeScript engine, 15 Zod contracts, pure reducer, GameSession, ports | 36 engine/contract tests |
| **Stage 4** | Playable Vertical Slice | Verified | Phaser 4 grid scene, collision, movement, Relay 7 interaction, dialogue | 31 scene/world tests |
| **Stage 5** | Narrative & Causal Engine | Verified | Gated evidence chain, 3 consequential decisions, 3 endings, monotonic story phase | 31 narrative/causal tests |
| **Stage 6** | Real Timeline Branching | Verified | BLINK branch forks, checkpoint rebase, branch switching, scar allowlist carry | 10 branching tests |
| **Stage 7** | MORROW Bounded Policy | Verified | Fairness guard, proposal evaluation, duplicate protection, ceiling rules | 11 MORROW tests |
| **Stage 8** | ECHO Grounded Retrieval | Verified | Read-only service, strict lineage scoping, typed claims, citation tracking | 10 ECHO retrieval tests |
| **Stage 9** | Scripted NPC Cognition | Verified | Sable/Ivo perception, proposal loop, deterministic fallback, branch memory | 13 NPC cognition tests |

Total verified tests across the test harness: **16 test suites, 142 tests passing** (0 failures).
Full build verification (`npm run verify`): TypeScript compilation, Vitest suites, and Vite production bundle all pass cleanly.

---

## 2. System Architecture & Invariants

The game architecture adheres strictly to hexagonal port-and-adapter boundaries and single-authority state reduction:

```
+-------------------------------------------------------------------------+
|                               UI Layer                                  |
| (React 19 Components: Ledger, BlinkPanel, EchoPanel, NpcPanel, Stage)   |
+-------------------------------------------------------------------------+
                                    |
                         useSyncExternalStore
                                    v
+-------------------------------------------------------------------------+
|                      DeterministicGameSession                           |
|  - Sole authority for canonical GameState                               |
|  - Manages BranchRuntime instances (active + forked branches)           |
|  - Validates all actions via core/validation.ts                         |
|  - Evaluates rules via core/rules.ts                                    |
|  - Emits immutable GameEvent logs                                       |
+-------------------------------------------------------------------------+
         |                     |                     |               |
         v                     v                     v               v
  +--------------+      +--------------+      +--------------+ +-----------+
  |  ClockPort   |      |GamePolicyPort|      |PersistencePort| |ContentPort|
  +--------------+      +--------------+      +--------------+ +-----------+
```

### Permanent Architectural Invariants
1. **Single Authority**: `GameSession` is the sole source of truth for canonical game state. UI components and external agents never mutate state directly.
2. **Deterministic Engine**: Engine rules determine state transitions. Outside systems (including AI/LLMs) propose actions; the engine validates and executes them.
3. **BLINK Branch Isolation**: Branch timelines are strictly isolated. Child branches inherit parent state up to the fork checkpoint; post-checkpoint parent events are never visible to the child. Scars are restricted to the explicit allowlist.
4. **ECHO Grounded & Read-Only**: ECHO cannot mutate state or dispatch actions; queries are evaluated strictly against active branch lineage with explicit citations.
5. **MORROW Engine Bounded**: MORROW proposals are validated against strict fairness, escalation, and ceiling rules.
6. **NPC Cognition Scoped**: NPC perception reads permitted branch facts only. Memory is partitioned by `(branchId, npcId)`.

---

## 3. Existing Dependencies & Technologies

- **Runtime / Framework**: Node.js `>=22.12.0`, React `19.3.1`, React DOM `19.3.1`
- **Game Engine**: Phaser `4.2.1` (isolated behind React dynamic loader `PhaserHost`)
- **Schema & Validation**: Zod `4.6.7` (enforcing frozen contracts)
- **Tooling & Build**: TypeScript `7.0.2`, Vite `8.3.5`, Vitest `5.0.5`
- **Zero Heavy Runtime Bloat**: Zero unneeded runtime dependencies. No external database or network client in current bundle.

---

## 4. Known Technical Debt & Missing Capabilities

1. **Persistence is In-Memory Only**:
   - `PersistencePort` is currently implemented only by `InMemoryPersistence`.
   - Browser refresh loses game session and restores the default initial state.
   - `DeterministicGameSession.restore` currently only restores the active branch from `SaveEnvelope.payload`, lacking multi-branch runtime reconstitution and historical event restoration.
2. **SaveEnvelope Scope**:
   - `SaveEnvelope` holds `payload: GameState`, but does not serialize event logs across inactive branch runtimes.
3. **Replay & Migration**:
   - Deterministic event log replay from tick 0 to stateVersion N is not yet packaged into a restore validator.
4. **Server-Side Integration**:
   - YugabyteDB and Meko are intentionally unintegrated at this stage. Browser persistence must be rock-solid on IndexedDB first before any network dependencies are introduced.
5. **NPC & Policy Scalability**:
   - NPC policies are currently deterministic scripts; rate limiting and external LLM gateway infrastructure are yet to be built (planned for Part F / Stage 12+).

---

## 5. Acceptance Status for Stages 7–9

- **Stage 7 (MORROW)**: **ACCEPTED**. Deterministic escalation, rate limits, ceiling, fairness guard, and duplicate checks verified.
- **Stage 8 (ECHO)**: **ACCEPTED**. Read-only queries, citations, branch-isolated fact retrieval, and missing fact handling verified.
- **Stage 9 (NPC Cognition)**: **ACCEPTED**. Scripted perception-proposal cycle, actor validation, observation hash checking, and memory isolation verified.

---

## 6. Readiness for Stage 10 (Durable Persistence)

The repository is clean, verified, and ready for Stage 10.
The next step is the creation of `docs/STAGE_10_PLAN.md` and subsequent implementation of IndexedDB-backed durable persistence.
