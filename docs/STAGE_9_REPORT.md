# Stage 9 Report - NPC Cognition Runtime

Status: **implemented and verified; Stage 10 not started.**
Date: 2026-10-31
Version: 0.5.0

## 1. Objective

Add deterministic, branch-scoped cognition for Sable and Ivo without widening
the durable contract surface, inventing story content, or granting NPCs direct
state writes.

## 2. What changed

| Area | Change |
|---|---|
| `content/npcContent.ts` | Sable and Ivo definitions with permitted fact prefixes |
| `npc/observation.ts` | permission-filtered observation over active branch lineage |
| `npc/policy.ts` | deterministic scripted policies and fallback proposal |
| `npc/controller.ts` | observe, evaluate, dispatch, fallback and memory provenance |
| `npc/memory.ts` | `NpcMemoryPort` and `InMemoryNpcMemory` keyed by branch and NPC |
| `core/actions.ts` | additive `npc.propose` params |
| `core/validation.ts` | actor, session, branch, freshness, observation binding and no-op checks |
| `session/gameSession.ts` | accepted/refused `npc.proposal.evaluated`, duplicate and one-per-tick checks |
| `ui/NpcPanel.tsx` | proposal, status, fallback, rationale and memory view |
| `App.tsx` | NPC button, automatic evaluation after evidence/choices and callout |
| docs | ADR 0017, NPC model, plan, this report, architecture/event/catalogue updates |

No contract or event schema changed. `CONTRACT_VERSION` stays `1.0.0`,
`CONTRACT_NAMES` stays at 15 and `EVENT_TYPES` stays at 12.

## 3. Acceptance matrix

| # | Test | Result |
|---|---|---|
| 1 | identical observation and memory -> identical proposal | pass |
| 2 | valid proposal accepted through `GameSession.dispatch` | pass |
| 3 | accepted proposal leaves canonical facts unchanged | pass |
| 4 | wrong actor rejected | pass |
| 5 | wrong branch rejected | pass |
| 6 | malformed proposal rejected | pass |
| 7 | stale tick rejected | pass |
| 8 | stale state version rejected | pass |
| 9 | duplicate proposal id rejected | pass |
| 10 | second proposal by same NPC in one branch tick rejected | pass |
| 11 | child sees no parent post-fork facts or events | pass |
| 12 | memory isolated by branch and NPC | pass |
| 13 | memory cites engine event ids | pass |
| 14 | policy exception -> deterministic fallback no-op | pass |
| 15 | invalid policy output -> deterministic fallback no-op | pass |
| 16 | observation excludes unpermitted fact prefixes | pass |
| 17 | no decision -> no proposal and no event | pass |
| 18 | Ivo policy independent of Sable | pass |

## 4. Verification

Commands and outcomes:

```text
npm run verify
  typecheck: pass
  tests: 140 passed / 16 files
  production build: pass (Vite 8.3.5)
```

The only build warning is Vite's existing >500 kB chunk advisory.

Implementation commit: `175985d` (`feat(stage9): scripted NPC cognition with
branch-scoped memory`).

Remote CI run `41211874808` on `175985d`:
<https://github.com/demonstrikkk/last_blink/actions/runs/41211874808>

- `Typecheck, tests and build`: success
- `Asset pipeline integrity`: success

The docs-only commit for this report is verified separately after push.

## 5. Implemented vs not verified

Implemented and verified:

- both scripted policies, engine validation and audit;
- branch-scoped in-memory memory and provenance;
- deterministic fallback for exceptions and invalid output;
- compact NPC panel and automatic evaluation hooks;
- all Stage 3-8 suites still green.

Implemented but not browser-verified:

- visual layout and interaction of the `NPCs` button, panel and callout.
  Playwright/Chromium are not installed in this environment, so no screenshot
  or browser evidence is claimed.

Deferred / known limits:

- NPC proposals are advisory only (`session.noop`); they do not mutate story.
- Memory is process-local and discarded on refresh; no durable memory.
- No LLM, embeddings, autonomous multi-NPC simulation or free-text dialogue.
- No PPO MORROW, LLM ECHO, YugabyteDB, Meko or Stage 10 work was started.
- The combined Stage 7-8 gate sign-off remains a separate checklist item.
