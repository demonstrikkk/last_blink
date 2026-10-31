# Stage 8 Report - ECHO Branch-Aware Retrieval

Status: **implemented, combined Stage 7-8 gate pending.**
Date: 2026-10-31
Version: 0.5.0

## 1. Objective

Give the player a way to ask what the record can support, without inventing
canonical state or leaking another timeline's discoveries.

## 2. What changed

| Area | Change |
|---|---|
| `echo/echoService.ts` | typed retrieval, claim/citation model, grounded/partial/unknown status, branch scoping, explicit comparison |
| `engine/index.ts` | exports `EchoService` and answer types |
| `ui/EchoPanel.tsx` | accessible dialog with query modes, fact key input, decision select, branch comparison select, answer and citations |
| `App.tsx` | `ECHO` topbar button and panel wiring |
| `styles.css` | ECHO panel, claim, citation and MORROW callout styling |
| docs | `ECHO_RETRIEVAL_MODEL.md`, this plan/report pair, ADR 0016 |

### Retrieval rules

- Single-branch queries use `getBranchState(branchId)` plus
  `getLineageEvents(branchId)`; the latter already applies the Stage 6 fork cutoff.
- `compare` is the only two-branch query and delegates to
  `session.compareBranches`.
- Every substantive claim carries at least one citation. `unavailable` is the
  only claim kind that may be uncited.
- An absent fact/decision/ending returns `unknown` or `partial` with an explicit
  `missing` list.
- ECHO never dispatches an action and never writes a fact.

## 3. Acceptance matrix

| # | Test | Result |
|---|---|---|
| 1 | unknown fact -> unknown | pass |
| 2 | known fact cites fact + event | pass |
| 3 | pending decision -> partial | pass |
| 4 | committed decision cited | pass |
| 5 | MORROW records cited | pass |
| 6 | child cannot see parent post-fork evidence | pass |
| 7 | explicit comparison cites both branches | pass |
| 8 | ending cites event, definition, rule | pass |
| 9 | no ending -> unknown | pass |
| 10 | situation scoped and cited | pass |

## 4. Verification

```
npm run typecheck   # clean
npm test            # 128 tests, 15 files
npm run build       # production build succeeds
npm run verify      # typecheck + tests + build
```

## 5. UI verification and limits

- The ECHO panel is wired into the running app and the production build succeeds.
- Automated screenshots were **not** captured: Playwright/Chromium is not
  installed in this environment. No screenshot is claimed as evidence.
- Manual runbook: start `npm run dev`, press `ECHO`, ask `Situation`, collect the
  relay log, ask `Fact` for `evidence.relay_7`, then ask `Decision` for
  `node.sable.relay` before and after choosing. Each answer should change status
  and cite records.
- ECHO is a typed-query service, not a free-text chatbot. There is no LLM,
  embedding store or network call.
- A branch that is known but not materialised returns `unknown` rather than a
  reconstructed answer.

## 6. Combined Stage 7-8 gate

Implementation and internal verification are complete. Commits: implementation
`867dff1`, docs `89a34e4`; both were pushed to `main`. Remote CI run
[41210187574](https://github.com/demonstrikkk/last_blink/actions/runs/41210187574)
completed with `Typecheck, tests and build` and `Asset pipeline integrity`
green. The combined Stage 7-8 gate awaits user sign-off.
