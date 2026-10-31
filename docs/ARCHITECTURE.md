# Architecture — The Last Blink: Second Settlement

Status: Stage 3 foundation, version 0.1.0. This document describes what exists and
what later stages are allowed to add. It is deliberately narrower than the game
design blueprint: Stage 3 establishes authority and contracts, not gameplay.

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
| `src/engine/content` | seed content for the scaffold | be treated as final story content |
| `src/game` | Phaser boot and future scenes | store canonical state or write facts directly |
| `src/session/runtime.ts` | browser composition root | leak into engine imports |
| `src/App.tsx` | presentation, input, aria live text | mutate snapshots or calculate game outcomes |
| future backend | LLM calls, Meko, YSQL credentials, audit export | become a second source of game truth |

## 4. Request lifecycle

1. UI, test or future agent submits an untrusted object to
   `GameSession.dispatch(raw)`. `gameActionSchema` parses it.
2. `validateAction` checks shape, references and Stage 3 scope. Failures return
   `invalid_action`, `unknown_target` or `duplicate`.
3. `GamePolicyPort.evaluate` may deny. Denials return `policy_denied`.
4. Accepted actions produce events through one path:
   `GameSession` builds a typed event, `gameEventSchema` validates it,
   `reduceGameState` checks ordering/provenance and returns a new state.
5. Rules run after tick advances and asserted facts. They emit
   `rule.evaluated`, derived `fact.asserted` and optionally `ending.reached`.
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

`PhaserHost` dynamically imports Phaser, draws a boot grid and reads the latest
snapshot through a callback each frame. The canvas is `aria-hidden`; the same
state is present as DOM text, including an `aria-live` action result. Stage 4
will add the map, movement, collision and interaction scenes; those scenes will
dispatch actions and render snapshots, not own game state.

## 9. Directory layout

```
src/
  App.tsx                    React shell
  main.tsx                   entry point
  styles.css                 design tokens and layout
  game/PhaserHost.tsx        Phaser boot host
  session/runtime.ts         browser composition root
  engine/
    contracts/               15 schemas, primitives, registry, fixtures
    core/                    canonical JSON, hash, IDs, reducer, rules, validation
    content/stage3Content.ts scaffold facts and rules
    session/                 GameSession, ports, deterministic mocks
    index.ts                 public engine surface
tests/                       36 Vitest checks across 6 files
tools/assets/               preserved asset pipeline
docs/                       gate evidence, architecture, contracts, ADRs
```

## 10. Failure behaviour

| Failure | Behaviour |
|---|---|
| Malformed or out-of-scope action | rejected, audited, state facts unchanged |
| Policy denial | rejected, audited, `policy_denied` |
| Unknown anchor or duplicate fork | rejected before events |
| Reducer invariant violation | throws `EngineInvariantError`; this is a programming defect, not a player outcome |
| Persistence failure | `save()` rejects; in-memory state remains usable |
| Model/agent failure (future) | scripted fallback proposal; engine still validates |
| Listener exception | caught and logged; other subscribers still run |

## 11. Deliberate Stage 3 limits

- `branch.fork` records a child timeline but does not switch the active branch.
  BLINK switching and cross-timeline comparison are Stage 6.
- Rule evaluation is one ordered pass, not a fixpoint.
- `MemoryRecord`, `NpcObservation` and `NpcDecisionProposal` are contracts and
  fixtures only; no cognition runtime exists yet.
- Persistence is in memory; reloading resets the session.
- Content is scaffold (`debug.*` facts), not story content.
- No map, movement, collision, dialogue, LLM, Meko or YugabyteDB.
