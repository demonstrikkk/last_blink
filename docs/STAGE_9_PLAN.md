# Stage 9 Plan - NPC Cognition Runtime

Status: implementation complete, gate evidence pending final verification.
Scope owner: AI runtime.

## Objective

Give Sable and Ivo a deterministic cognition loop that observes only what their
definitions permit, proposes only advisory no-ops, and retains branch-scoped
in-memory context with canonical event provenance.

## Scope

In:

- scripted policies for both Sable and Ivo;
- permission-filtered observations over the active branch;
- `npc.propose` through normal `GameSession` validation;
- accepted and refused `npc.proposal.evaluated` audit records;
- `InMemoryNpcMemory` keyed by `(branchId, npcId)`;
- deterministic fallback for policy exceptions and invalid output;
- compact NPC panel with proposal, status, fallback and memory views;
- tests for determinism, staleness, duplicates, actor/branch ownership,
  observation filtering, memory isolation and fallback.

Out:

- new contracts, event types or contract-version bumps;
- LLM policies, free-text dialogue or embeddings;
- durable memory or save changes;
- autonomous multi-NPC simulation;
- new facts, choices, rules, story beats or endings;
- PPO MORROW, ECHO LLM, YugabyteDB, Meko, Stage 10.

## Contracts

Reuse `NpcDefinition`, `NpcObservation`, `NpcDecisionProposal`, `MemoryRecord`
and `npc.proposal.evaluated`. Add `npc.propose` to `actionTypeSchema` only;
`npcActionTypeSchema` remains the frozen five-action NPC vocabulary.

## Acceptance tests

1. Identical observation and memory produce identical proposals.
2. A valid proposal is accepted through `GameSession.dispatch`.
3. Accepted proposals do not change canonical facts.
4. Wrong actor, wrong branch and malformed proposals are rejected.
5. Stale tick or state version is rejected.
6. Duplicate ids and a second proposal by the same NPC in one branch tick are
   rejected.
7. Child branches cannot observe parent post-fork facts or events.
8. Memory is isolated by branch and cites engine event ids.
9. A policy exception yields a deterministic fallback no-op.
10. Invalid policy output yields a deterministic fallback no-op.
11. Observations exclude facts outside the definition's permitted prefixes.
12. No proposal is emitted when the policy has no decision.

## Verification

- `npm run verify`
- remote CI on the pushed commit
- no browser screenshots: Playwright/Chromium are not installed in this
  environment.
