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
| `fact.asserted` | Fact | accepted `fact.assert`, initial content, rule effects |
| `choice.made` | Choice | future choice resolver |
| `rule.evaluated` | ruleId, matched, assertedFactKeys | rule pass |
| `anchor.recorded` | Anchor | accepted `anchor.record` |
| `branch.forked` | Branch, fromAnchorId | accepted `branch.fork` |
| `npc.proposal.evaluated` | proposalId, npcId, status, reasonCode | future cognition runtime |
| `ending.reached` | endingId, summary, factKeys | rule `set_ending` effect |
| `action.rejected` | actionType, code, message, proposalId | dispatch rejection audit |

`choice.made`, `npc.proposal.evaluated` and `ending.reached` are frozen now but
not produced by Stage 3 gameplay; their valid fixtures and schemas are tested.

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

After a tick advance or a non-derived fact assertion, rules are ordered by
priority descending, then rule ID ascending by code unit. Each enabled rule is
evaluated once against a value map that includes effects applied by earlier rules
in the same pass. A matched rule emits:

1. `rule.evaluated` with the asserted fact keys;
2. one derived `fact.asserted` per effect key (last effect wins for duplicate
   keys within one rule);
3. `ending.reached` if the rule sets an ending and the branch has none.

Derived facts do not trigger another pass in Stage 3. There is no fixpoint
iteration, no wall-clock trigger and no random trigger.

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
- `branch.fork` records a child timeline with parent, anchor, tick and version. It
  does **not** switch the active branch in Stage 3. BLINK switching, old-timeline
  preservation and comparison are Stage 6.
- Anchors marked `safe: false` cannot be forked. Unsafe-anchor creation is left
  to the BLINK stage.

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
