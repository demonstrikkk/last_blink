# ADR 0008 — Additive action vocabulary for evidence and choices

- Status: accepted
- Date: 2026-10-31
- Owners: engine, narrative
- Supersedes: none
- Related: ADR 0001 (engine authority), ADR 0004 (evidence as facts)

## Context

Stage 3 froze five action types: `session.noop`, `session.advance_tick`,
`fact.assert`, `anchor.record` and `branch.fork`. It also restricted
`fact.assert` to `debug.*` keys so a UI or an NPC could not invent canonical
facts.

Stage 4 needs two player actions that write canonical state through
`GameSession`, not through the renderer:

1. collecting the relay log evidence item, and
2. committing the Sable conversation choice.

Routing evidence through `fact.assert` would require loosening the debug-only
gate, which would let any caller assert arbitrary story facts. Routing the
choice through UI state would make React a second source of truth. Both are
unacceptable.

## Decision

Extend the action vocabulary additively with two content-validated actions:

- `evidence.collect { evidenceId }` — the engine looks up the evidence
  definition in `GameContent`, asserts its declared `factKey` with
  `kind: 'observed'` and `source.kind: 'record'`, and rejects a second
  collection with code `duplicate`.
- `choice.make { nodeId, optionId }` — the engine looks up the choice node and
  option in `GameContent`, emits `choice.made` (the existing frozen event),
  asserts the option's declared effect facts, then runs one rule pass so rules
  can derive visible consequences. A repeated option on the same node is
  rejected with code `duplicate`.

Constraints that keep the extension honest:

- No new event types, no new contract. Existing `fact.asserted` and
  `choice.made` payloads are reused unchanged.
- Action parameters never carry fact keys or values. Content owns the mapping;
  untrusted callers only name a definition.
- `fact.assert` remains debug-only.
- `NPC permissions.allowedActionTypes` keeps the original five-value enum,
  defined separately as `npcActionTypeSchema`, so the frozen NPC contract does
  not silently widen.
- `CONTRACT_VERSION` stays `1.0.0`. No migration is required: no existing save
  contains the new action types, and every existing document still validates.
  An older engine reading a newer save would only fail if that save contained a
  new action type in an `action.rejected` event; there is no deployed older
  engine.

Consequence of a choice is derived twice, deliberately:

1. the option declares the decision facts (`story.relay_choice`,
   `story.relay_choice_resolved`), which are canonical and auditable; and
2. rules guarded by `not exists` derive the visible world facts
   (`world.ward_alert`, `npc.sable.stance`) exactly once.

Rules re-run after every accepted action, so every derived rule in Stage 4
carries an existence guard to prevent re-firing.

## Consequences

- The action vocabulary is a closed enum with seven members; adding an eighth
  requires a new ADR.
- Content is trusted and versioned with the session; it is validated by
  `gameContentSchema` at the composition root.
- The engine stays headless-testable: both actions are pure functions of
  state plus content plus parameters.
- Documentation (`docs/EVENT_MODEL.md`, `docs/CONTRACT_CATALOGUE.md`) records
  the extension rather than silently drifting.
