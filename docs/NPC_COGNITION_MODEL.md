# NPC Cognition Model - Stage 9

Stage 9 adds a scripted cognition loop for Sable and Ivo. It is an audit and
memory pipeline, not a second narrative engine.

## Pipeline

```text
GameSession state + branch lineage
  -> buildNpcObservation (definition permission filter)
  -> NpcPolicy.evaluate(observation, branch-scoped memory)
  -> NpcDecisionProposal
  -> GameSession.dispatch({ actionType: "npc.propose" })
  -> validation + duplicate/freshness checks
  -> npc.proposal.evaluated
  -> InMemoryNpcMemory record with event provenance
```

The controller never writes facts. The only accepted effect is the evaluation
event itself.

## Observation

`buildNpcObservation` exposes:

- facts whose keys start with one of the definition's
  `permissions.observableFactPrefixes`;
- the active branch id, tick and state version;
- the last 12 event ids from `getLineageEvents(activeBranch)`.

The Stage 6 ancestry cutoff therefore applies automatically. `perceptionHash`
hashes the visible payload without `createdAt`, so identical canonical state
produces the same observation id.

Sable may see `evidence.*`, `story.*`, `npc.sable.*` and `world.ward_alert`.
Ivo may see `evidence.*`, `story.*`, `npc.ivo.*`, `world.vendor_confidence` and
`world.dispatch_continuity`.

## Scripted policies

| NPC | Proposes when | Otherwise |
|---|---|---|
| Sable | `evidence.relay_7` is visible and `story.relay_choice_resolved` is absent | no proposal |
| Ivo | `evidence.vendor_testimony` is visible and `story.vendor_choice_resolved` is absent | no proposal |

Both proposals contain one `session.noop` action and a rationale. The rationale
notes whether branch-scoped memory already contains a prior proposal. Proposal
ids are hashes of the observation id, NPC, policy id, rationale and confidence;
no clock or randomness participates.

## Engine checks

`npc.propose` is rejected unless:

- the proposal matches `NpcDecisionProposal`;
- the actor id equals `proposal.npcId`;
- session and branch match the active state;
- `proposal.tick` and `basedOnStateVersion` are current;
- `proposal.observationId` is `obs_<observationHash>`;
- every proposed action is `session.noop`;
- the proposal id has not already been evaluated on this branch;
- the NPC has not already proposed on this branch at this tick.

A rejected proposal writes `action.rejected` and a rejected
`npc.proposal.evaluated` record. The controller then stores a memory record
citing those event ids.

## Fallback

If a policy throws, the controller creates a fallback no-op with zero
confidence and rationale `Deterministic fallback (policy_exception)`. If the
policy returns a value that fails the proposal schema, the reason is
`invalid_output`. The fallback is submitted through the same engine path and is
therefore auditable; it is never presented as the original policy's result.

## Memory

`InMemoryNpcMemory` keys records by `(branchId, npcId)` and validates each
record with `memoryRecordSchema`. Every record cites at least one event id from
the dispatch result. The adapter is process-local: it is discarded on refresh,
not saved, and never inherited by a child branch.

## UI

The `NPCs` panel shows each definition's observation scope, last evaluation on
the active branch, accepted/refused status, rationale, confidence, proposed
action, fallback reason, memory id and branch memory count. The panel never
offers free-text dialogue and never writes story content.

## Limits

- Advisory only: no NPC proposal changes a fact, choice, anchor, branch or
  ending in Stage 9.
- No durable memory, embeddings, vector store or LLM.
- No autonomous multi-NPC simulation.
- No browser screenshot verification was run in this environment.
