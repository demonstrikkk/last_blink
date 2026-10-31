# MORROW Policy Model - Stage 7

MORROW is a bounded antagonist policy. It observes one branch, proposes one
response and submits it to the engine. It never writes state directly.

## Loop

```
GameSession state (one branch)
        |
        v
buildMorrowObservation()  -> obs_<hash>, observationHash
        |
        v
MorrowPolicy.propose()    -> prp_<hash>, response, reasonCodes
        |
        v
GameSession.dispatch({ actionType: 'morrow.intervene', actorId: 'system_morrow' })
        |
        v
validation -> reducer -> morrow.proposal.evaluated (+ morrow.intervened if accepted)
```

`MorrowController.run()` owns the loop. `observe()` and `plan()` expose the two
halves for tests and tooling.

## Observation features

Every field is derived from the active branch's canonical state only:

| Group | Fields |
|---|---|
| Evidence | sorted `evidenceKeys`, `evidenceCount` |
| Decisions | `choices` (node/option pairs), `choicesMade` |
| Story | `phase`, `endingId` |
| World | `scrutiny`, `wardAlert`, `dispatchContinuity`, `vendorConfidence` |
| MORROW | `lastResponse`, `escalation` |
| Log shape | last twelve event types |

No wall clock, no randomness, no other branch. `observationId` is
`obs_<fnv1a64>` over session, branch, tick, state version, policy version,
trigger event and features. `MorrowController` accepts an injectable clock only
for the `createdAt` timestamp; the proposal itself excludes time.

## Responses and ladder

Responses: `observe`, `warn`, `restrict`, `redirect`, `escalate`, `release`.

| From | Allowed next |
|---|---|
| null | observe, warn, release |
| observe | observe, warn, release |
| warn | observe, warn, restrict, release |
| restrict | observe, restrict, escalate, release |
| escalate | observe, escalate, release |
| redirect | observe, redirect, release |
| release | observe, release, warn |

`observe` is always legal, so MORROW can always stand down. The engine — not the
policy — enforces the table.

## Baseline policy

The deterministic baseline (`createDeterministicMorrowPolicy`) is the required
Stage 7 policy. It is a risk posture, not a storyteller:

- no evidence and no decisions -> `observe`;
- evidence exists -> `warn`;
- deeper investigation or elevated/critical scrutiny -> `restrict`;
- critical scrutiny or strong evidence/depth at `restrict` -> `escalate`;
- ending committed -> `release` (or `observe` if already released);
- otherwise hold the current posture, which the controller skips rather than
  writing a no-op.

Reason codes are upper-snake-case: `BASELINE_OBSERVE`, `EVIDENCE_PRESSURE`,
`INVESTIGATION_DEPTH`, `SCRUTINY_RAISED`, `SCRUTINY_CRITICAL`,
`ESCALATION_WARRANTED`, `POSTURE_HOLD`, `NO_NEW_SIGNAL`, `ENDING_REACHED`,
`ENDING_RELEASE`, `REOPENED_INVESTIGATION`.

## Fairness rules enforced by the engine

1. Only `system_morrow` may submit `morrow.intervene`.
2. `basedOnStateVersion` must equal the current state version (`stale_state`).
3. A recorded `proposalId` may not be applied twice (`duplicate`).
4. The response must be reachable from the current posture (`policy_denied`).
5. `escalate` is refused at `MAX_MORROW_ESCALATION = 3` (monotonic, capped; release
   does not reset it).
6. Once `endingId` is set, only `release` or `observe` are permitted.

Rejected proposals are still audited: `morrow.proposal.evaluated` is emitted with
`status: 'rejected'`, the reason and the proposal id. Rejection never writes
facts and never advances state.

## Controller guards

- A policy that throws, or returns an invalid proposal, falls back to the
  baseline policy and marks the turn `fallback: true`. If both fail, the error is
  not swallowed.
- A proposal that would repeat the current posture is skipped (`run()` returns
  `null`) so ticking does not append no-op facts.
- The same observation hash is skipped until the branch state changes.
- `reset(branchId?)` clears the posture guard after a timeline switch.

## Facts and events

On acceptance the session emits `morrow.proposal.evaluated` (`accepted`) then
`morrow.intervened`, then asserts:

| Key | Value |
|---|---|
| `morrow.response` | the accepted response |
| `morrow.last_proposal` | the proposal id |
| `morrow.escalation` | capped escalation counter |

## Out of scope (Stage 7)

No learned or PPO policy, no LLM, no NPC cognition, no cross-branch observation,
no wall-clock pressure and no punitive ending. The baseline policy is a
deterministic stand-in with a stable interface (`MorrowPolicy`) that a later
model can implement behind the same engine checks.
