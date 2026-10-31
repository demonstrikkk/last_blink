# ADR 0016 - MORROW and ECHO extend the event vocabulary without new save contracts

- Status: accepted
- Date: 2026-10-31
- Owners: engine, ai-runtime
- Supersedes: none
- Related: ADR 0001 (engine authority), ADR 0003 (zod contracts), ADR 0008
  (action vocabulary extension), ADR 0013 (branch lifecycle), ADR 0014 (scar
  memory)

## Context

Stage 7 (MORROW) and Stage 8 (ECHO) need typed proposals, observations and
answers. The frozen `CONTRACT_REGISTRY` already contains fifteen contracts, and
`SaveEnvelope` requires exactly those keys at version `1.0.0`. Adding a sixteenth
registered contract would make every Stage 6 save fail validation on load, even
though no save field would actually be missing from the story.

At the same time, MORROW interventions are canonical history: an accepted or
rejected proposal must be replayable and visible in the ledger. ECHO, by
contrast, is read-only and must never become state.

## Decision

1. **MORROW and ECHO runtime schemas live outside the registry.**
   `src/engine/contracts/morrow.ts` and the EchoService result types are runtime
   validation contracts. They are exported but not added to `CONTRACT_NAMES` or
   `registry.ts`, so `SaveEnvelope` and `CONTRACT_VERSION` stay at `1.0.0`.
2. **Two GameEvent variants are added additively:** `morrow.proposal.evaluated`
   (`accepted` or `rejected`) and `morrow.intervened`. Both are members of the
   frozen `GameEvent` discriminated union and `EVENT_TYPES`; the vocabulary grows
   from ten to twelve. No existing event payload changes.
3. **`morrow.intervene` is a new action type.** It is submitted only by
   `system_morrow`, carries a complete proposal, and is validated by the same
   boundary gate as player actions.
4. **ECHO produces no events and writes no facts.** Its answer is a transient
   view model. Adding it to the registry would imply it is durable, which it is
   not.
5. **The three MORROW facts are ordinary facts:** `morrow.response`,
   `morrow.last_proposal` and `morrow.escalation`, all `derived`, with
   `source.ref: morrow.policy:<policyId>`. They participate in hashing, save and
   branch isolation exactly like any other fact.
6. The additive event change is documented here and in `docs/EVENT_MODEL.md`, and
   the registry test now asserts twelve event types.

## Consequences

- Stage 6 saves remain loadable without migration.
- A later decision to persist MORROW observations or ECHO answers would require
  a new ADR and a contract-bump migration, not an implicit schema change.
- Replay of a MORROW decision needs only the accepted event; the proposal payload
  is embedded in the event, and the controller is not part of replay.
- The cost is two parallel notions of "contract": registry contracts (durable)
  and runtime schemas (transient). This ADR records the boundary explicitly so it
  cannot drift silently.
