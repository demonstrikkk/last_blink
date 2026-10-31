# Architecture — The Last Blink: Second Settlement

Status: Stage 5 narrative and causal slice, version 0.3.0. This document
describes what exists and what later stages are allowed to add. It is
deliberately narrower than the game design blueprint: Stage 5 adds a causal
investigation to the one playable street that Stage 4 delivered, on top of the
unchanged Stage 3 authority and contracts.

## 1. Principles

1. **The deterministic engine owns canonical state.** Physics, facts, rules,
   anchors, branches, choices and endings are engine concerns.
2. **AI proposes; the engine decides.** A model, policy or script can submit an
   action. Only `GameSession.dispatch` validates it, records an `ActionResult`
   and applies events.
3. **Phaser renders; React frames.** Neither is a source of truth. Closing the
   canvas or reloading the UI cannot change the world.
4. **Contracts are executable.** Every boundary object has a Zod schema, a
   version, an owner and valid/invalid fixtures.
5. **Replay over repair.** Identical inputs, seed and clock produce an identical
   state hash and event log.
6. **Ports at the edges.** Time, policy, persistence, content and logging are
   injected. The engine imports none of their implementations.
7. **No secrets in the browser.** Model keys, database credentials and Meko
   tokens will live server-side behind ports; they are never bundled.

## 2. Layer map

```
┌────────────────────────────────────────────────────────────────────┐
│ React shell — src/App.tsx, src/main.tsx                            │
│ status panels, controls, accessible text mirror                    │
│                                                                    │
│ Phaser host — src/game/PhaserHost.tsx                              │
│ boot scene only; reads snapshots, owns no state                    │
└───────────────┬───────────────────────────────▲────────────────────┘
                │ GameAction (untrusted)        │ GameSnapshot
                ▼                               │
┌────────────────────────────────────────────────────────────────────┐
│ GameSession — src/engine/session/gameSession.ts                    │
│ dispatch · subscribe · save · restore · recent events              │
│                                                                    │
│  validateAction ──► GamePolicyPort ──► reducer ──► rules            │
│        │                 │                │           │            │
│        └── rejected ─────┴── denied       └── events ─┘            │
└───────────────┬──────────────────────────────────────────────▲─────┘
                │ GameEvent                                    │
                ▼                                              │
┌────────────────────────────────────────────────────────────────────┐
│ Deterministic engine — src/engine/core, contracts, content         │
│ canonical JSON · FNV-1a hashing · IDs · reducer · rule evaluator    │
│ pure TypeScript: no DOM, Phaser, React, network, clock or randomness│
└────────────────────────────────────────────────────────────────────┘

Injected ports (implementations live outside the engine):
  ClockPort · GamePolicyPort · PersistencePort · ContentPort · LoggerPort
  InMemoryPersistence · StaticContentPort · FixedClock · InMemoryLogger

Future, behind the same boundary:
  NpcObservation → cognition runtime → NpcDecisionProposal → GameSession
  IndexedDB / YSQL persistence · MORROW policy · ECHO retrieval · Meko MCP
```

## 3. What each layer owns

| Layer | Owns | Must not |
|---|---|---|
| `src/engine/contracts` | schemas, versions, fixtures, registry | import UI, Phaser, network, database drivers |
| `src/engine/core` | canonical JSON, hash, IDs, reducer, rules, action validation | read wall clock, `Math.random`, DOM, `fetch` |
| `src/engine/session` | `GameSession`, ports, deterministic mocks | contain game rules or rendering |
| `src/engine/content` | seed content for the scaffold and the Stage 5 story content | be treated as final story content |
| `src/world` | map grid, movement, interaction range, canonical-to-view projection | import Phaser, React or DOM APIs |
| `src/game` | Phaser scene, rendering, input presentation | store canonical state or write facts directly |
| `src/ui` | dialogue sheet, field notes, ledger, touch controls | keep a competing copy of canonical facts |
| `src/session/runtime.ts` | browser composition root | leak into engine imports |
| `src/App.tsx` | presentation, input, dialogue state machine, aria live text | mutate snapshots or calculate game outcomes |
| future backend | LLM calls, Meko, YSQL credentials, audit export | become a second source of game truth |

## 4. Request lifecycle

1. UI, test or future agent submits an untrusted object to
   `GameSession.dispatch(raw)`. `gameActionSchema` parses it.
2. `validateAction` checks shape, references and content prerequisites. Failures
   return `invalid_action`, `unknown_target` or `duplicate`. Missing evidence or
   decision prerequisites are reported as `invalid_action` with
   `details.missing: [factKey, …]` (ADR 0009).
3. `GamePolicyPort.evaluate` may deny. Denials return `policy_denied`.
4. Accepted actions produce events through one path:
   `GameSession` builds a typed event, `gameEventSchema` validates it,
   `reduceGameState` checks ordering/provenance and returns a new state.
5. Rules run after tick advances, asserted facts, evidence collection and a
   committed choice. They emit `rule.evaluated`, derived `fact.asserted` and
   optionally `ending.reached`.
6. The session commits the snapshot, notifies subscribers and returns an
   `ActionResult` with every produced event ID and the resulting state hash.
7. Rejected actions still emit one `action.rejected` audit event. World facts and
   tick do not change; `stateVersion` advances so the refusal is replayable.

## 5. Determinism contract

Enforced by `tests/determinism.test.ts` and `tests/enginePurity.test.ts`:

- All time comes from `ClockPort`. `Date.now` is banned in `src/engine/**`.
- IDs come from `createDeterministicIdFactory(seed, startAt)`.
- Randomness is not used in the engine. `Math.random` is banned.
- Rule order is priority descending, then rule ID ascending by code unit.
- Objects are serialised with `canonicalJson`: sorted keys, finite numbers only.
- State and event hashes are FNV-1a 64-bit over UTF-8, rendered as 16 hex chars.
- Reducer ordering is strict: `event.stateVersion === state.stateVersion + 1` and
  `event.sequenceNo === event.stateVersion`.
- Identical inputs, seed and clock produce identical state and event logs.
  Different state produces a different hash.

The hash is a determinism and integrity check, not a security primitive. See ADR
0005.

## 6. Persistence boundary

`PersistencePort` stores a `SaveEnvelope`, not loose state:

```
SaveEnvelope
  saveFormatVersion 1
  contractVersions {GameEvent: "1.0.0", …all 15…}
  engineStateHash      FNV-1a of canonical payload
  payload              GameState
  checksum             FNV-1a of every other envelope field
```

Restore validates schema, format, all contract versions, checksum and state hash
before constructing a session. A save from different content is refused.
`InMemoryPersistence` is the Stage 3 adapter; IndexedDB and YSQL implement the
same port later without touching the engine.

## 7. Policy boundary

`GamePolicyPort` receives the validated action and the current state. It returns
`{ allowed }` plus an optional reason. It cannot mutate state, emit events or read
hidden facts beyond the state it is given. Stage 3 ships `allowAllPolicy` and
`createPrefixPolicy`, a deterministic stand-in for MORROW. NPC cognition in Stage
9 will submit `NpcDecisionProposal` objects through `GameSession`, never direct
writes.

## 8. Rendering boundary

`PhaserHost` dynamically imports Phaser and creates `DistrictScene`. The scene
bakes the Aster street from the code-authored grid, places props, follows the
player and draws interaction markers. It reads the latest canonical projection
through `getView()` each frame and reports interaction intents upward
(`onPrompt`, `onInteract`). It never dispatches to `GameSession` and never writes
a fact. The canvas is `aria-hidden`; React carries the accessible text mirror,
including the dialogue sheet, field notes, ledger and `aria-live` announcements.

Player position, facing, camera and proximity are presentation state. They are
updated in fixed 1/60 s steps (frame-rate independent) and are not saved, hashed
or replayed. Only `evidence.collect`, `choice.make` and `anchor.record` reach the
engine.

Dialogue scripts are presentation data too. A script may open even when its
choice node is gated: the player hears the conversation, and the sheet then shows
the gate text and the fact keys the engine still requires. Opening Ivo's script
also dispatches `evidence.collect` for his testimony, if the engine allows it —
the UI never writes the fact itself.

Appendix: `?debug=1` exposes the Phaser game instance as `window.__lastBlinkGame`
for automated verification only. It is not a gameplay or persistence API.

## 9. Directory layout

```
src/
  App.tsx                    React shell, dialogue state machine, input
  main.tsx                   entry point
  styles.css                 design tokens and layout
  content/                   Stage 5 facts, rules, evidence, choices, dialogue
  game/PhaserHost.tsx        Phaser host and world handle boundary
  game/DistrictScene.ts      Aster street scene, camera, markers, audio
  ui/                        dialogue sheet, field notes, ledger, touch controls
  world/                     map grid, movement, interaction range, world view
  session/runtime.ts         browser composition root
  engine/
    contracts/               15 schemas, primitives, registry, fixtures
    core/                    canonical JSON, hash, IDs, reducer, rules, validation
    content/stage3Content.ts scaffold facts, rules and the content schema
    session/                 GameSession, ports, deterministic mocks
    index.ts                 public engine surface
tests/                       98 Vitest checks across 12 files
tools/assets/               preserved asset pipeline
docs/                       gate evidence, architecture, contracts, ADRs
```

## 9a. Stage 5 investigation

The playable slice is still one street, now carrying a three-act investigation
with three evidence items, three decisions and three reachable endings. Full
semantics: `docs/CAUSAL_MODEL.md`.

| Target | Kind | Action | Canonical effect |
|---|---|---|---|
| Relay 7 terminal | evidence | `evidence.collect` | `evidence.relay_7`; derives `story.relay_ready`, phase `investigation` |
| Sable | npc | dialogue, then `choice.make` | `choice.made`; rules derive `world.ward_alert`, `npc.sable.stance`, `npc.sable.trust`; phase `decision` |
| Ward dispatch board | evidence | `evidence.collect` | `evidence.ward_dispatch`; delayed rules resolve `world.dispatch_continuity` from the earlier relay decision |
| Ivo | npc | dialogue (grants testimony), then `choice.make` | `evidence.vendor_testimony`; rules derive `npc.ivo.stance`, `world.vendor_confidence`, `world.morrow_scrutiny`; phase `accounting` |
| Ward call-box | decision | `choice.make` | `story.ward_call`; ending rules derive `story.ending_id` and emit `ending.reached`; phase `resolved` |
| cyan lamp post | anchor | `anchor.record` | anchor checkpoint with the pre-event state hash |

`deriveWorldView(state, content)` is the single fact-to-UI projection used by
React and Phaser. It now carries evidence provenance and availability, objective
completion, per-decision availability and missing prerequisites, the causal
facts, and the resolved ending. There is no parallel story store.

Evidence and choice definitions live in trusted `GameContent`; action payloads
only name a trusted ID, so an action cannot invent a fact key or value. Evidence
and decision prerequisites are declared in the same content and enforced by the
engine (ADR 0009), so a UI that hides a locked decision and an action submitted
by hand agree.

Both interactive actions are additively guarded against duplicates: a second
`evidence.collect` for the same item and a second `choice.make` for the same node
are rejected with `duplicate` and audited. See ADR 0008 for why the action
vocabulary was extended without changing the frozen event payloads.

## 10. Failure behaviour

| Failure | Behaviour |
|---|---|
| Malformed or out-of-scope action | rejected, audited, state facts unchanged |
| Missing evidence or decision prerequisite | rejected with `invalid_action` and `details.missing`; audited; facts unchanged |
| Policy denial | rejected, audited, `policy_denied` |
| Unknown anchor or duplicate fork | rejected before events |
| Reducer invariant violation | throws `EngineInvariantError`; this is a programming defect, not a player outcome |
| Persistence failure | `save()` rejects; in-memory state remains usable |
| Model/agent failure (future) | scripted fallback proposal; engine still validates |
| Listener exception | caught and logged; other subscribers still run |

## 11. Deliberate limits at Stage 5

- BLINK branch switching, scar memory and cross-timeline comparison are deferred.
  `branch.fork` still records a child timeline without switching.
- Rule evaluation is one ordered pass, not a fixpoint. Delayed consequences are
  milestone-triggered by facts, never by wall-clock time.
- `MemoryRecord`, `NpcObservation` and `NpcDecisionProposal` remain contracts and
  fixtures; there is no NPC cognition runtime. Sable, Ivo and the call-box are
  scripted conversations.
- Prerequisites are a flat conjunction of fact keys. Disjunctions or numeric
  thresholds would need a content-schema change and a new ADR.
- Persistence is in memory; reloading restarts the street. The UI states this
  plainly instead of implying a save.
- Content is one street. ECHO retrieval, LLM dialogue, MORROW policy, YugabyteDB
  and Meko do not exist yet.
- Player position is presentation state, not canonical and not saved.
