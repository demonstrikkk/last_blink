# ADR 0017 - NPC Cognition Runtime Reuses Existing Contracts

Status: accepted (Stage 9)
Date: 2026-10-31

## Context

Stage 3 froze `NpcDefinition`, `NpcObservation`, `NpcDecisionProposal`,
`MemoryRecord` and the `npc.proposal.evaluated` event, but no runtime submitted
proposals. Stages 7 and 8 established deterministic policy loops and
branch-scoped read models. Stage 9 must add real cognition for Sable and Ivo
without changing story content, durable saves, or the contract registry.

## Decision

- Reuse the four existing NPC contracts unchanged. `CONTRACT_VERSION` remains
  `1.0.0`, `CONTRACT_NAMES` remains 15 entries, and the event union remains 12
  variants.
- Reuse `npc.proposal.evaluated` for accepted and refused proposals. No new
  event type or payload field is introduced.
- Add one action type, `npc.propose`, to the runtime action vocabulary. It
  carries an untrusted `NpcDecisionProposal`, the observation hash and the state
  version the proposal was decided from.
- Keep Stage 9 advisory-only: a proposal may contain only `session.noop`.
  Accepted proposals therefore produce an audit event but no fact, choice,
  ending or rule effect. Widening this allowlist requires a later ADR.
- Scope memory with an `NpcMemoryPort`. The only Stage 9 adapter is
  `InMemoryNpcMemory`, keyed by `(branchId, npcId)`. Memory is never saved and
  never shared across branches.
- Make both NPC policies scripted and deterministic. No LLM, embeddings, PPO or
  wall-clock-dependent decision is permitted.

## Consequences

- The frozen durable-contract surface and save format are untouched.
- `npc.propose` is additive action vocabulary, like `morrow.intervene`; it does
  not widen `npcActionTypeSchema`, so an NPC can never propose recursively.
- Memory disappears on refresh and branch switches, which is the documented
  Stage 9 limit.
- The engine, not the controller, enforces actor identity, branch/session
  ownership, tick and state freshness, duplicate ids, one proposal per NPC per
  branch tick, and the no-op allowlist.
- A policy exception or invalid output produces a deterministic fallback no-op
  proposal, still submitted through the normal engine boundary and audited.
