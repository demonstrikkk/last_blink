# Event Model

The event log is the game's audit trail and its replay source. State is a pure
fold over validated events; no other path may change canonical state.

## 1. Envelope

Every event has the same envelope, regardless of type:

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "evt_5e8533_0003",
  "sessionId": "ses_local_mwv7mj12",
  "branchId": "brn_9f39bb_0001",
  "sequenceNo": 3,
  "stateVersion": 3,
  "tick": 0,
  "type": "fact.asserted",
  "actorId": "system_engine",
  "sourceId": "engine.bootstrap",
  "actionId": null,
  "occurredAt": "2026-10-31T15:09:09.000Z",
  "idempotencyKey": "evt_5e8533_0003:event",
  "payload": { "…": "type-specific" }
}
```

| Field | Meaning |
|---|---|
| eventId | deterministic ID from the session seed and allocator |
| sessionId / branchId | scope; must match the current session and branch |
| sequenceNo | session-wide, strictly increasing, positive |
| stateVersion | version produced by applying this event |
| tick | game tick, injected and independent of wall time |
| type | discriminator; ten variants in v1 |
| actorId | player, NPC or system that caused the event |
| sourceId | subsystem: `engine.core`, `engine.rules`, `input.player`, `policy.npc`… |
| actionId | action that produced this event, or null for bootstrap/rule events |
| occurredAt | ISO timestamp from `ClockPort` |
| idempotencyKey | replay/dedupe key; at least 8 characters |
| payload | strict object whose shape is selected by `type` |

## 2. Ordering invariants

For every event applied to state:

```
event.sessionId   === state.sessionId
event.branchId    === state.branchId
event.stateVersion === state.stateVersion + 1
event.sequenceNo   === event.stateVersion
```

Stage 3 keeps branch-scoped versions and session-wide sequences numerically
equal. A future BLINK switch may decouple them; that requires a new event-model
version, not a silent change.

Other invariants:

- `session.started` can only apply at version 0, at tick 0, with matching
  content ID, game version and seed.
- `tick.advanced.fromTick` must equal the current tick and `toTick` cannot move
  backwards. The event's `tick` equals `toTick`.
- Facts are asserted at the current tick; `fact.sourceEventId` must equal the
  event ID; fact IDs are unique.
- Choices are unique per branch and must reference the emitting event.
- Anchors checkpoint the **pre-event** version and hash.
- A fork must descend from the current branch at the current version/tick, use an
  existing anchor and take the next timeline index.
- The first ending committed on a branch wins; a conflicting ending throws.
- `rule.evaluated`, `npc.proposal.evaluated` and `action.rejected` do not change
  world facts. They change only version, last event and the audit log.

Violations throw `EngineInvariantError`. That is a defect in engine or producer
code, not a player outcome, and is never silently repaired.

## 3. Event catalogue

| Type | Payload | Emitted by |
|---|---|---|
| `session.started` | contentId, gameVersion, seed | session creation |
| `tick.advanced` | fromTick, toTick, reason | accepted `session.advance_tick` |
| `fact.asserted` | Fact | accepted `fact.assert`, initial content, evidence/choice effects, rule effects |
| `choice.made` | Choice | accepted `choice.make` |
| `rule.evaluated` | ruleId, matched, assertedFactKeys | rule pass |
| `anchor.recorded` | Anchor | accepted `anchor.record` |
| `branch.forked` | Branch, fromAnchorId | accepted `branch.fork` |
| `npc.proposal.evaluated` | proposalId, npcId, status, reasonCode | future cognition runtime |
| `ending.reached` | endingId, summary, factKeys | rule `set_ending` effect |
| `action.rejected` | actionType, code, message, proposalId | dispatch rejection audit |

`choice.made` and `ending.reached` were frozen in Stage 3. Stage 4 exercised
`choice.made`; Stage 5 now exercises `ending.reached` through content rules.
`npc.proposal.evaluated` is still not produced by gameplay; its schema and valid
fixture are tested.

## 3a. Stage 4 action vocabulary

Stage 4 added two actions without changing any event payload or contract version
(ADR 0008):

| Action | Params | Events | Duplicate guard |
|---|---|---|---|
| `evidence.collect` | `{ evidenceId }` | one `fact.asserted` for the trusted evidence fact | rejected with `duplicate` when the fact already exists |
| `choice.make` | `{ nodeId, optionId }` | one `choice.made`, then one `fact.asserted` per declared effect | rejected with `duplicate` when a choice exists for the node |

Both resolve their fact keys and values from trusted `GameContent`; the action
payload cannot name a fact. After either action is applied, one rule pass runs
with the usual ordering rules. A rejected collection or choice emits the standard
single `action.rejected` audit event and leaves world facts unchanged.

`fact.assert` remains an escape hatch used by tests, the bootstrap and the scar
carry path. Stage 6 widened its key allowance from `debug.*` to `debug.*` and
`scar.*` only; every other namespace is still refused (ADR 0014).

## 3b. Stage 5 content prerequisites and endings

Stage 5 added no event, action or contract. Everything it needed fitted into
existing content and existing rejection codes (ADR 0009).

| Content field | Meaning | Enforced by |
|---|---|---|
| `evidence.requires[]` | fact keys that must exist before collection | `validateAction` |
| `evidence.sourceKind` | `record` / `testimony` / `asset`; becomes `fact.source.kind` | evidence action |
| `choices[].requires[]` | fact keys that must exist before a decision | `validateAction` |
| `objectives[]`, `endings[]` | presentation metadata for derived progress and rule endings | projection only |

A missing prerequisite rejects with the frozen `invalid_action` code and
`details.missing` listing the absent keys. The duplicate guard is checked first,
so a re-committed decision reports `duplicate`.

Endings are emitted by rule `set_ending` effects, guarded by
`not exists story.ending_id`:

1. the rule pass emits `rule.evaluated`;
2. it asserts the derived `story.ending_id` fact;
3. it emits `ending.reached` with the ending ID, summary and contributing fact
   keys.

The reducer keeps the first ending on a branch and throws on a conflicting one.
Stage 5 content declares three endings; all are reachable and covered by tests.
Semantics and the full variable catalogue live in `docs/CAUSAL_MODEL.md`.

## 4. Actions, acceptance and rejection

```
dispatch(raw)
  ├─ gameActionSchema.parse(raw) ───────────────► invalid_action
  ├─ validateAction(state, action) ─────────────► invalid_action / duplicate / unknown_target
  ├─ policy.evaluate({action, state}) ──────────► policy_denied
  ├─ build typed event(s)
  ├─ gameEventSchema.parse(event)
  ├─ reduceGameState(state, event) ─────────────► EngineInvariantError (defect)
  └─ commit snapshot, notify, return ActionResult
```

Rejection is auditable. It emits **one** `action.rejected` event and returns an
`ActionResult` with `status: "rejected"`, a rejection code/message/details and the
audit event ID. World facts, tick and choices do not change. `stateVersion`
advances, so the refusal is replayable and cannot be ignored in an audit.

Accepted actions return every event ID they produced, including rule events, and
the resulting state hash.

## 5. Rule pass

After a tick advance, a non-derived fact assertion, evidence collection or a
committed choice, rules are ordered by
priority descending, then rule ID ascending by code unit. Each enabled rule is
evaluated once against a value map that includes effects applied by earlier rules
in the same pass. A matched rule emits:

1. `rule.evaluated` with the asserted fact keys;
2. one derived `fact.asserted` per effect key (last effect wins for duplicate
   keys within one rule);
3. `ending.reached` if the rule sets an ending and the branch has none.

Derived facts do not trigger another pass. There is no fixpoint iteration, no
wall-clock trigger and no random trigger. A consequence that must appear later
(for example, dispatch continuity resolving only after the dispatch slip is
found) is expressed as a rule whose condition includes the later fact, so it
fires on the pass that follows that discovery.

Stage 5 adds about twenty-five rules. They stay inside the same one-pass
semantics by using explicit guards: a rule that writes a mutable variable tests
`not exists` on the fact it writes, or tests `neq`/`in` against the value it would
write. Phase rules list only earlier phases in their `in` guard, so the highest
reachable phase wins and cannot regress.

## 6. State reduction and hashes

`reduceGameState` returns a new object; it never mutates its input. The session
then commits:

```
snapshot = {
  state,
  hash: FNV-1a64(canonicalJson(state)),
  revision: revision + 1
}
```

`canonicalJson` sorts object keys, normalises `-0`, rejects non-finite numbers,
undefined, functions, class instances and cycles. Therefore logically equal
states hash equally and insertion order cannot affect results.

The hash is used for:

- state snapshot identity;
- anchor checkpoint integrity;
- `SaveEnvelope.engineStateHash`;
- determinism tests.

It is not a signature and not collision-resistant against an adversary. See ADR
0005.

## 7. Save and restore

Envelope construction:

```
payload           = canonical GameState
engineStateHash   = hash(payload)
contractVersions  = { each of 15 contracts: "1.0.0" }
checksum          = hash({
                      saveFormatVersion, saveId, gameVersion, sessionId,
                      savedAt, engineStateHash, contractVersions, payload
                    })
```

Restore order:

1. `saveEnvelopeSchema.parse` — strict shape, format literal 1, branded IDs.
2. Contract set check — all 15 present, no unknown names, all versions match.
3. Checksum check — mismatch throws `save checksum mismatch`.
4. State hash check — mismatch throws `save state hash mismatch`.
5. Content check — content ID and game version must match the loaded content.
6. Construct the session from the payload. No events are replayed because the
   payload already contains the result.

Restored sessions have an empty in-memory event log; the save is the checkpoint.
The ID factory resumes with a restore-specific seed so new IDs cannot collide.

## 8. Branches and anchors

- The root branch is created at session start with `timelineIndex: 0`.
- `anchor.record` stores the pre-event version and hash, one anchor per tick per
  branch. The reducer recomputes the hash and rejects tampering.
- `branch.fork` records a child timeline with parent, anchor, tick, version,
  event sequence and checkpoint hash. Those coordinates always describe the
  anchor checkpoint, not the parent's live state, and the reducer validates them
  against the anchor before writing anything.
- Forking does **not** activate the child. `GameSession.forkTimeline` returns the
  new branch ID; `GameSession.switchBranch` performs the activation as a session
  operation with no canonical event.
- The child state is the parent's retained state at the checkpoint, re-scoped to
  the child branch. Post-checkpoint facts, choices, anchors and events do not
  cross. The parent's only write is the `branch.forked` event itself.
- `scar.*` facts asserted on the parent after the checkpoint cross as explicit
  `fact.asserted` events on the child (`source.ref: scar.carry:<key>`). Nothing
  else crosses; see ADR 0014.
- `getLineageEvents` reports ancestor events up to the fork point followed by the
  branch's own events. Shared ancestry is reported, never replayed into the child.
- `switchBranch` re-verifies the retained hash before moving the pointer and
  returns `unknown_branch`, `already_active`, `stale_snapshot` or
  `hash_mismatch` on refusal. A refused switch leaves the active snapshot
  untouched.
- Anchors marked `safe: false` cannot be forked. Unsafe-anchor creation is left
  to a later BLINK stage.

## 9. Replay

Given the same content, seed, clock sequence and ordered actions, a fresh session
must produce the same event log and the same final hash. `tests/determinism.test.ts`
runs the full scenario twice and compares canonical state, snapshot hash and log.

A future replay tool will accept `{contentVersion, seed, clockStart, actions[]}`
and compare the final hash. Nothing in Stage 3 requires wall time or ambient
randomness to reproduce a session.

## 10. Versioning and migration

- Contracts are versioned by literal `schemaVersion: "1.0.0"`.
- Saves carry all contract versions; mismatches are rejected before payload use.
- Additive optional fields require a minor version and reader default.
- Renames, removals, new required fields and incompatible enum changes require a
  major version and a tested migration.
- Event model changes that alter ordering, payload meaning or branch semantics
  require an ADR and a migration plan before implementation.
- No silent coercion, best-effort parsing or “fix up on load” is allowed.
