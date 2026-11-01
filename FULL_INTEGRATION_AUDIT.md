# Full Integration Audit

Date: 2026-11-01
Scope: Phase 0 only. This document records the repository state before any implementation changes.

## Executive summary

The repository is a functioning Relay Street vertical slice, not yet the complete explorable investigation game or production backend described in the master brief.

The deterministic engine, GameSession, authored Phaser world, Stage 5 investigation, BLINK branching, MORROW, ECHO, Stage 9 NPC cognition, and IndexedDB persistence are present and covered by automated tests. The current world is still one large authored district grid with street-level targets and three facade-style enterable areas; it is not yet a connected circular city with separate interior scenes, authored investigation locations, interconnected puzzles, or the full acceptance journey.

The current cloud files are prototypes and are not safe to ship. `src/services/yugabyteService.ts` stores data in process memory and contains a hard-coded database password. It creates a short-lived `pg` connection only for a connectivity probe, disables TLS certificate verification, and does not implement migrations, pooled transactions, atomic GameSession persistence, or a backend API. `src/services/mekoService.ts` contains a hard-coded Meko token and uses a browser-capable `fetch` integration with fallback behavior; it is not a server-side, authenticated backend boundary. Groq, Gemini, a central model gateway, authentication, and a release backend are absent.

## Repository and verification state

- Working tree was clean at audit time.
- Current HEAD: `3449fe9 feat(stage12): integrate Meko MCP collective memory, YugabyteDB transactional audit and expanded narrative cast`.
- Recent history includes the Stage 10 persistence commit and the Stage 12 cloud-integration prototype.
- Node requirement is `>=22.12.0`; package uses React 19.3.1, Phaser 4.2.1, Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, Zod 4.6.7, and `pg` 8.23.1.
- `npm run verify` passed: typecheck passed, 20 test files and 175 tests passed, and production build passed.
- The build reports a large Phaser chunk of about 1.37 MB minified / 357 KB gzip. This is a performance follow-up, not a Phase 0 failure.
- The Stage 12 test suite includes a live Meko read test in the current environment. This proves only that the test environment had working access during this audit; it does not prove a production deployment or safe credential handling.

## What is actually implemented

### Canonical engine and session

Present under `src/engine`:

- Zod-backed contracts, versioned events and actions.
- Deterministic canonical JSON and FNV hashing.
- Reducer, rule evaluation, validation and event ordering.
- `GameSession` as the state authority.
- Branch runtime, anchor checkpoints, fork, switch and comparison.
- MORROW bounded proposals with validation and fallback.
- ECHO read-only branch-scoped retrieval and citations.
- Stage 9 deterministic NPC cognition for Sable and Ivo with scoped observation, policy registry, fallback and branch/NPC memory port.

The architecture documents correctly state that React and Phaser render or submit intents and must not own canonical facts. The engine purity tests enforce the absence of browser, network, clock and uncontrolled randomness dependencies in the engine.

### Current game world

Present under `src/world` and `src/game`:

- A 96 by 44 code-authored grid, 16-pixel tiles, camera-follow movement, collision, interaction range and fixed-step movement tests.
- Central Relay Street, east commercial plaza, south market/freight area, a west connector, authored targets and a large map footprint.
- Visual environment tilemap, character sprites, lighting grade, rain, mist, particles, audio, interaction markers and responsive React HUD.
- Relay 7, Nocturne Diner and Freight Depot coordinates are represented in the grid, but the implementation is currently a single district scene. Separate interior scenes/layouts, robust entry/exit state, furniture/terminal interactions and interior-specific collision are not established as a complete system.
- The active registered visible cast in the scene has expanded beyond the Stage 9 cognition registry. Stage 9 cognition remains explicitly limited to Sable and Ivo; the additional visible characters are not evidence that their cognitive policies are safely registered.

### Investigation and narrative

Present:

- Relay 7 evidence, Sable dialogue/decision, dispatch evidence, Ivo testimony/decision, ward call decision, three existing endings, journal/field notes, ledger, objectives and evidence provenance.
- Deterministic prerequisites and duplicate-action protection.
- Existing MORROW, ECHO and BLINK semantics remain additive and tested.

Missing or incomplete relative to the new brief:

- Full authored city investigation loop across the required buildings and streets.
- Searchable infrastructure/object pools with deterministic optional clue selection and guaranteed mandatory clues.
- Cross-linked evidence board with richer people/place/event/hypothesis relationships.
- Interconnected optical jumper, guestbook/frequency, locker/override and terminal/dispatch puzzle chain.
- Evidence-gated MORROW termination sequence while preserving the three existing endings.
- Full 24-step acceptance journey and a browser visual QA capture set for every requested scene.

### Persistence

Present:

- IndexedDB adapter and in-memory IndexedDB test factory.
- Envelope schema validation, checksum/state hash verification, event and branch snapshot stores, transactional writes and recovery tests.
- Stage 10 tests cover reload, integrity failure, multi-branch recovery and durable event/snapshot data.

Missing:

- Local-to-cloud migration/import and reconciliation protocol.
- Offline action queue and conflict resolution rules.
- Cloud save versioning, optimistic concurrency and database-backed branch recovery.

## Cloud and AI integration audit

### YugabyteDB: prototype only and release blocker

`src/services/yugabyteService.ts` currently keeps sessions, branches, events, settlements, decisions, audit rows and snapshots in Maps/arrays. The `pg` import is used only in `connect()` for a probe and the pool is immediately closed. No database schema, migration directory, migration runner, backend route, session ownership, GameSession event persistence, transaction boundary, retry classification, idempotency table, or readiness endpoint exists.

Configuration is hard-coded in source, including a database password. TLS is configured with `rejectUnauthorized: false`. This violates the brief and must be remediated before any live deployment. The service also uses `Date.now()` and `Math.random()` for IDs in the adapter; this is acceptable only outside the deterministic engine, but it is not a suitable production idempotency strategy.

### Meko: prototype only and release blocker

`src/services/mekoService.ts` contains a hard-coded bearer token and datapack configuration. It calls the remote MCP endpoint directly with `fetch`, parses one SSE-shaped response with a regex, and falls back to local memory. It does not provide a server-only credential boundary, MCP session/tool capability negotiation, durable audit linkage, bounded retrieval policy, or proven isolation against Meko's authenticated-user-wide search behavior. Tagging text with NPC and branch identifiers is not sufficient isolation.

The development-agent connection described in the brief is documentation/configuration work separate from the game backend integration. No repository-safe Antigravity MCP config or setup guide is currently present.

### Groq, Gemini and Model Gateway

No Groq adapter, Gemini adapter, `@google/genai` dependency, central gateway, task routing, budgets, deduplication, cache, circuit breaker, provider health model, structured response validation, or mocked provider tests were found.

### Backend/security

No separate server application, API routes, authentication, player/session authorization, health/readiness endpoints, structured server logging, secret redaction checks, `.env.example`, or deployment setup was found. The browser build must not import or receive private provider/database credentials. Existing hard-coded credentials must be treated as compromised: revoke/rotate them outside this repository before implementation proceeds.

## Asset inventory

The repository includes licensed Ansimuz/Kenney environment and character archives, IBM Plex Mono and Space Grotesk fonts, audio files, asset manifests/catalogues, license records and visual-style documentation. The current implementation uses a subset of the available tilemap, character sprites and audio. Required production categories such as distinct interior art, evidence-specific props, richer portraits, signs and scene-specific visual sets are not fully represented in the public asset inventory or runtime.

No new external art should be added until the existing catalogue is mapped to the required scenes and every addition has a license record.

## Gap and risk assessment

| Priority | Gap | Risk | Required response |
|---|---|---|---|
| P0 | Hard-coded Yugabyte and Meko credentials | Secret compromise and unauthorized access | Revoke/rotate immediately; remove from source; add secret-leak CI check and `.env.example` |
| P0 | Browser-oriented cloud services and fake Yugabyte persistence | Data loss, false production confidence, broken authorization | Introduce backend boundary and real adapter tests before live integration |
| P0 | TLS verification disabled | MITM risk | Require CA configuration and certificate verification |
| P1 | No backend/auth/schema/migrations | Cannot provide production saves or ownership | Build backend, schema, migrations, transaction/idempotency layer |
| P1 | World remains a vertical slice | Acceptance journey cannot be completed | Extend existing map/scene contracts into authored locations and interiors |
| P1 | No Groq/Gemini gateway | AI requirements absent | Add adapters behind one validated, budgeted gateway |
| P1 | Meko isolation is asserted by text filtering | Cross-NPC/branch leakage risk | Keep private canonical memory in YugabyteDB; use Meko only for approved shared context unless isolation is proven |
| P2 | No offline/cloud reconciliation | Local saves can diverge or be overwritten | Define versioned import, queue, conflict and recovery protocol |
| P2 | No full browser visual QA | Rendering defects may remain hidden | Use a real browser run and capture the requested acceptance screenshots |
| P2 | Phaser bundle size | Startup/performance cost | Revisit after gameplay scope stabilizes |

## Exact implementation sequence

1. Security containment: revoke/rotate exposed credentials, remove defaults, add `.env.example`, secret scanning, and server-only configuration.
2. Backend foundation: create a minimal Node server, auth/session ownership boundary, health/readiness, structured logging, error redaction, and a GameSession orchestration port.
3. Yugabyte persistence: choose `pg` or Smart Driver based on deployment topology, add CA-verified pooling, migrations, schema, idempotency, optimistic concurrency and atomic event/snapshot commits.
4. IndexedDB compatibility: specify and implement import, sync queue, conflict resolution and recovery without deleting local saves.
5. Gameplay expansion: extend the existing grid/scene and `WorldView` rather than replacing the engine; add connected city routes, real building transitions/interiors, authored searches, clue graph and puzzle chain.
6. Narrative integration: add the evidence-gated MORROW route, preserve the three existing endings, and register any new cognitive NPC only with contracts, policies and tests.
7. Meko backend integration: implement the supported server-side MCP/client flow with bounded shared knowledge retrieval; prove private data remains in the canonical database.
8. Model Gateway: add Groq and Gemini adapters, structured schemas, routing, budgets, retries, circuit breaker, health and deterministic fallback. Models remain proposal-only.
9. Full integration and QA: run the acceptance journey in a real browser, capture visual evidence, run mocked provider/database tests and live tests only when credentials are supplied.
10. Release gate: typecheck, tests, production build, secret scan, migration rehearsal, recovery tests, setup/report documents and known-limitations list.

## Complexity estimate

- Security containment and backend skeleton: medium, 1 focused implementation phase.
- Yugabyte schema/transactions/migration/reconciliation: high, 2–3 phases.
- Connected city, interiors, authored investigation and puzzles: high, 3–5 phases depending on asset reuse.
- Meko server integration and isolation proof: medium-high, 1–2 phases and credential-dependent verification.
- Groq/Gemini gateway: medium-high, 1–2 phases.
- Full browser and release QA: medium-high, 1–2 phases after features stabilize.

## Phase 0 conclusion

The current repository has a credible deterministic vertical-slice foundation and all automated checks pass, but the Stage 12 cloud commit must not be treated as production integration. The next implementation task should be P0 security containment plus the minimal backend boundary, followed by real Yugabyte persistence. Gameplay expansion should continue on top of the existing engine after the persistence boundary is safe. No source implementation was changed during this audit.
