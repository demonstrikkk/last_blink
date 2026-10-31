# Stage 7 Plan - MORROW Bounded Policy

Status: implemented with Stage 8; awaiting combined Stage 7-8 gate.
Date: 2026-10-31

## Objective

Add a deterministic, auditable MORROW policy loop that can influence story
pressure without ever owning state. MORROW observes one branch, proposes one
bounded response and is refused by the engine when the proposal is stale,
duplicate, unreachable or unfair.

## Scope

- MORROW observation and proposal contracts (runtime schemas).
- `morrow.intervene` action, `system_morrow` actor only.
- `morrow.proposal.evaluated` and `morrow.intervened` events.
- Transition ladder with `observe | warn | restrict | redirect | escalate | release`.
- Escalation ceiling of 3, monotonic, release does not reset it.
- Fairness: after an ending, only release or observe.
- Three derived facts: `morrow.response`, `morrow.last_proposal`, `morrow.escalation`.
- Deterministic baseline policy, throwing-policy fallback and posture-hold skip.
- Branch-scoped observation; no cross-timeline reads.
- UI: MORROW callout after accepted actions.

## Acceptance tests

1. Fresh session proposes `observe`; no pressure is invented.
2. Evidence raises the posture and writes facts and events atomically.
3. Same observation and policy produce the same proposal.
4. Stale proposal is rejected with `stale_state`.
5. Unreachable transition and wrong actor are rejected.
6. Escalation caps at 3 and the rejection is audited.
7. An ending forces `release`, allowed even on first contact.
8. Repeating the current posture is skipped, not written.
9. Throwing policy falls back to baseline with `fallback: true`.
10. Observation is schema-valid and scoped to the active branch.

## Out of scope

Learned/PPO policy, LLM, NPC cognition, persistent observation storage, remote
services, and any ending driven by MORROW pressure.
