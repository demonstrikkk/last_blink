# ADR 0014 - Scar memory is an explicit fact allowlist

- Status: accepted
- Date: 2026-10-31
- Owners: engine, narrative
- Supersedes: none
- Related: ADR 0001 (engine authority), ADR 0004 (evidence as facts), ADR 0008
  (action vocabulary), ADR 0013 (branch lifecycle)

## Context

A BLINK that carried nothing across would be a pure rewind: the player would
repeat a scene with no consequence. A BLINK that carried the parent's whole state
across would not be a second timeline at all. Stage 6 needs a narrow, auditable
channel for the one thing that is supposed to survive a blink.

The risk is leakage: if any fact asserted after the checkpoint crosses, then
evidence, decisions and derived outcomes cross too, and the two timelines stop
being independent. A `debug.*` channel would also be wrong: debug facts are test
scaffolding, not memory.

## Decision

**Scar memory is the `scar.*` fact namespace, and nothing else crosses a fork.**

1. A fact is a scar when its key starts with `scar.` (`isScarFactKey`).
2. On fork, the child receives scars that were asserted on the parent *after*
   the checkpoint. Scars that already existed at the checkpoint arrive as part of
   the checkpoint state and are not duplicated.
3. Each carried scar is written as an ordinary `fact.asserted` event on the
   child, with `source.kind: 'system'` and `source.ref: 'scar.carry:<key>'`. It is
   therefore visible in the ledger, in the child's lineage and in the child's
   hash - memory that crossed is auditable, not implied.
4. The child's `factId`, `sourceEventId` and `acquiredAtTick` are new. The key,
   value, kind and confidence are copied from the parent scar. The parent state
   is not modified.
5. `fact.assert` validation now accepts `scar.*` in addition to `debug.*`. The
   gate still refuses every other namespace, so a UI or NPC cannot mint story
   facts; scar keys are a memory channel, not a story channel.
6. Nothing else crosses. Evidence, choices, anchors, derived facts, endings and
   events after the checkpoint are excluded. The only ancestor events the child
   sees are those before its fork point, and those are reported as shared
   lineage, never replayed.

Ordering: scars are applied in sorted key order after the child's checkpoint
state exists, so a fork is deterministic regardless of fact insertion order.

## Consequences

- The allowlist is a namespace, which is simple to audit: grep for `scar.` and
  you have found every channel that survives a blink.
- A scar costs one event and one state version on the child, so a fork does not
  produce a child that is byte-identical to the checkpoint. The child's
  `stateVersion` equals `anchor.stateVersion` plus the number of carried scars.
  This is intentional and visible in the UI's checkpoint line.
- Story code can decide what is remembered by asserting `scar.*` deliberately;
  it cannot leak by accident.
- If memory later needs structured, non-fact records (ECHO), that is a different
  channel and needs a new ADR. This one deliberately does not generalise.
- The alternative - carrying a filtered subset of story facts - was rejected:
  every new fact key would silently become a leakage decision, and reviewers
  would have to reason about a growing list.
