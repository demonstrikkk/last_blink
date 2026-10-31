# Stage 7 Report - MORROW Bounded Policy

Status: **implemented, combined Stage 7-8 gate pending.**
Date: 2026-10-31
Version: 0.5.0 (content bundle unchanged)

## 1. Objective

Make MORROW a real but bounded antagonist: deterministic, branch-scoped and
unable to mutate state except through engine-validated interventions.

No LLM, no PPO, no NPC cognition runtime and no punitive ending was added.

## 2. What changed

### Engine

| Area | Change |
|---|---|
| `contracts/morrow.ts` | observation, proposal and policy schemas; policy/version constants; `MAX_MORROW_ESCALATION` |
| `contracts/primitives.ts` | `morrow.intervene` added to the action vocabulary |
| `contracts/gameEvent.ts` | additive `morrow.proposal.evaluated`, `morrow.intervened`; vocabulary 10 -> 12 |
| `contracts/index.ts` | exports the MORROW contracts |
| `core/actions.ts` | `morrowInterveneParamsSchema`, `ParsedAction` member |
| `core/validation.ts` | actor, freshness, duplicate, ladder, ceiling and ending fairness checks |
| `core/reducer.ts` | both MORROW event cases are non-state-changing and tick-invariant |
| `morrow/fairness.ts` | transition table, fact readers, capped escalation |
| `morrow/observation.ts` | deterministic `obs_<hash>` feature extraction from one branch |
| `morrow/policy.ts` | baseline posture policy and `prp_<hash>` proposals |
| `morrow/controller.ts` | observe -> propose -> dispatch loop, fallback, posture skip, branch reset |
| `session/gameSession.ts` | accepted `morrow.intervene` dispatch; rejection now carries `proposalId` and audits a rejected evaluated event |
| `engine/index.ts` | exports the MORROW and ECHO modules |

### UI

- `MorrowController` runs after accepted evidence and decision actions.
- A `MORROW` callout shows the accepted response and reason codes, or an engine
  refusal, without overwriting the action toast.
- Timeline fork/switch resets the controller posture guard and clears the callout.

## 3. Acceptance matrix

| # | Test | Result |
|---|---|---|
| 1 | untouched session -> observe | pass |
| 2 | evidence -> warn, atomic facts/events | pass |
| 3 | identical observation -> identical proposal | pass |
| 4 | stale proposal -> `stale_state` | pass |
| 5 | unreachable transition / wrong actor | pass |
| 6 | escalation ceiling audited | pass |
| 7 | ending -> release | pass |
| 8 | posture hold is skipped | pass |
| 9 | throwing policy -> fallback | pass |
| 10 | branch-scoped observation | pass |

## 4. Verification

```
npm run typecheck   # clean
npm test            # 128 tests, 15 files
npm run build       # production build succeeds
npm run verify      # typecheck + tests + build
```

The frozen registry still reports fifteen contracts and version `1.0.0`. The
event vocabulary is asserted at twelve. Stage 3-6 suites remain unchanged.

## 5. Limits

- MORROW facts live on the branch that accepted them; they do not cross a fork.
- The baseline policy is intentionally simple. A learned policy must implement
  the same `MorrowPolicy` interface and pass the same engine checks.
- No screenshots were captured automatically: Playwright/Chromium is not
  installed in this environment. Manual UI verification is recorded in the
  Stage 8 report as a limitation, not as an automated capture.
