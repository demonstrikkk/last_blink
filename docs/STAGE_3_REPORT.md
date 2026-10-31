# Stage 3 Report — Engineering Foundation

Status: **complete, awaiting Stage 3 acceptance sign-off.**
Date: 2026-10-31.
Stage 4 has not started.

## 1. Objective

Establish a coherent technical foundation so the game, narrative engine, AI,
persistence and future database/Meko work cannot be built around incompatible
assumptions.

Delivered: repository, strict TypeScript, React + Vite + Phaser scaffold, pure
deterministic engine, fifteen frozen contracts, `GameSession`, ports with
deterministic mocks, tests, CI, architecture and ADR records.

Not delivered, by design: map, movement, collision, story, dialogue, MORROW
policy, PPO/ONNX, LLM NPCs, live Meko, YugabyteDB deployment, production auth or
deployment.

## 2. Evidence summary

| Acceptance criterion | Result | Evidence |
|---|---|---|
| Git repository and clean baseline | Pass | baseline `2f3c710`, 95 tracked files; Stage 3 committed after this report |
| Strict TypeScript works | Pass | `npm run typecheck` exit 0 |
| React, Vite and Phaser start | Pass | production preview rendered shell and Phaser canvas; `docs/stage3_boot.png` |
| Engine runs without a browser | Pass | 6 Vitest files run under Node; purity scan blocks DOM/React/Phaser/network/clock/randomness |
| Fifteen contracts validate | Pass | registry test: 15 names, 15 valid fixtures accepted, 15 invalid rejected |
| Event serialisation round-trips | Pass | all 10 event variants plus real session events |
| Identical inputs produce identical outputs | Pass | two full scenarios match canonical state, hash and event log |
| `GameSession` exposes agreed interface | Pass | create, dispatch, snapshot, subscribe, advance, anchor, fork, save, restore |
| Persistence and policy mocks exist | Pass | `InMemoryPersistence`, `allowAllPolicy`, `createPrefixPolicy`, `StaticContentPort`, `FixedClock`, `InMemoryLogger` |
| CI runs install, type-check, tests, build | Local equivalent pass | `.github/workflows/ci.yml` validated as YAML; `npm ci`, typecheck, tests and build executed locally. GitHub Actions has not run because no remote exists yet. |
| Architecture decisions documented | Pass | `ARCHITECTURE.md`, `CONTRACT_CATALOGUE.md`, `EVENT_MODEL.md`, 7 ADRs |
| Asset pipeline remains functional | Pass | register 46/0 changed; validator 0 failures/0 warnings; 44/44 links |

## 3. Commands actually executed

All commands were run from the repository root on Windows with Node 22.15.0 and
npm 11.7.0.

| Command | Exit | Observed result |
|---|---|---|
| `node --version` / `npm --version` | 0 | `v22.15.0` / `11.7.0` |
| `npm ci` | 0 | 49 packages added, 50 audited, 0 vulnerabilities |
| `npm run typecheck` | 0 | `tsc --noEmit`, no diagnostics |
| `npm test` | 0 | 6 files passed, 36 tests passed, 1.08 s |
| `npm run build` | 0 | 147 modules transformed; app JS 361.22 kB (108.91 kB gzip); Phaser chunk 1,367.86 kB (357.33 kB gzip) |
| `npm run verify` | 0 | typecheck + 36 tests + production build, all green |
| `npm run dev` | — | Vite ready in 388 ms at `http://localhost:5173/` |
| `npm run preview` | — | production build served at `http://localhost:4173/` |
| Chrome headless screenshot | 0 | `docs/stage3_boot.png` (216,492 bytes) and `docs/stage3_boot_mobile.png` (109,457 bytes) |
| `python tools/assets/validate/build_register.py` | 0 | `46 assets, 0 changed, 2674.0 KiB shipped` |
| `python tools/assets/validate/validate_assets.py` | 0 | `PASS: 0 failure(s), 0 warning(s)` |
| `python tools/assets/validate/contrast_report.py` | 0 | report regenerated, worst body contrast unchanged at 7.37:1 |
| `python tools/assets/validate/check_catalogue_links.py` | 0 | `local references: 44, missing: 0`; HTML tags balanced |

Build note: Rolldown reports the Phaser chunk as larger than 500 kB. This is the
expected, isolated game-runtime chunk (dynamic import), not an accidental bundle
regression. It does not affect the engine tests or initial UI logic.

## 4. Repository state

- Branch: `main`.
- Baseline commit: `2f3c710 chore: baseline Stages 0-2 (visual direction, assets, pipeline)`.
- Stage 3 changes: scaffold, engine, contracts, tests, CI, docs, lockfile.
- `.gitignore`: `node_modules/`, `dist/`, caches, `.env*`, `assets/raw/extracted/`.
- `.gitattributes`: LF text, binary PNG/ZIP/OGG/TTF/WOFF/DOCX.
- Dependencies are pinned exactly and `package-lock.json` is committed.

## 5. What was built

### 5.1 Runtime

- `vite` 8.3.5, `react`/`react-dom` 19.3.1, `phaser` 4.2.1, `zod` 4.6.7.
- `typescript` 7.0.2, `vitest` 5.0.5, `@vitejs/plugin-react` 6.1.2.
- Strict config: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals/Parameters`,
  `verbatimModuleSyntax`, `isolatedModules`, bundler resolution, `noEmit`.
- Phaser is dynamically imported and code-split. React uses
  `useSyncExternalStore`; no state library.

### 5.2 Deterministic engine

- `canonicalJson` (sorted keys, JSON-only, rejects cycles/non-finite).
- FNV-1a 64-bit hashing; no `node:crypto`.
- Deterministic ID factory seeded by session.
- `reduceGameState` with strict ordering, provenance and anchor-hash checks.
- Ordered rule evaluator over a closed condition tree.
- Boundary validation for five Stage 3 actions.
- Zero imports of React, Phaser, DOM, network, `Date.now` or `Math.random`,
  enforced by a static scan.

### 5.3 Contracts

Fifteen contracts, all `1.0.0`, each with owner, valid fixture and invalid
fixture. Details: `docs/CONTRACT_CATALOGUE.md`.

| Contract | Owner | Invalid fixture proves |
|---|---|---|
| GameEvent | engine | malformed event ID |
| GameState | engine | fact map key / fact key mismatch |
| Fact | engine | confidence > 1 |
| Choice | narrative | wrong collection type |
| Rule | engine | `exists` with a value |
| Anchor | engine | empty label |
| Branch | engine | child without fork metadata |
| NpcDefinition | ai-runtime | `mayProposeOnly: false` |
| NpcObservation | ai-runtime | negative tick |
| NpcDecisionProposal | ai-runtime | `requiresValidation: false` |
| ActionResult | engine | rejected without rejection object |
| SaveEnvelope | persistence | future save format |
| PlayerProfile | narrative | blank display name |
| MemoryRecord | ai-runtime | expiry before creation |
| ModelManifest | platform | scripted policy declared non-deterministic |

### 5.4 GameSession and ports

`GameSession` exposes: `getState`, `getSnapshot`, `getRecentEvents`, `dispatch`,
`advanceTick`, `recordAnchor`, `forkBranch`, `subscribe`, `save`.

Ports: `ClockPort`, `GamePolicyPort`, `PersistencePort`, `ContentPort`,
`LoggerPort`. Stage 3 mocks are deterministic and offline. `restore` revalidates
format, contract versions, checksum, state hash and content identity.

### 5.5 Tests

| File | Tests | Focus |
|---|---|---|
| `contracts.test.ts` | 9 | registry completeness, fixtures, unknown keys, versions |
| `eventRoundTrip.test.ts` | 4 | all 10 variants, real session events, invalid payloads |
| `determinism.test.ts` | 5 | identical state/hash/log, key order, rule outcome |
| `gameSession.test.ts` | 10 | lifecycle, rules, anchors, forks, save/restore, invalid actions, policy denial, audit |
| `saveEnvelope.test.ts` | 5 | format, tampering, forged checksum, unknown/outdated contracts |
| `enginePurity.test.ts` | 3 | no browser/React/Phaser/network/clock/randomness leaks |
| **Total** | **36** | all passing |

### 5.6 CI

`.github/workflows/ci.yml` has two jobs:

1. `verify`: checkout, Node 22 with npm cache, `npm ci`, typecheck, tests,
   production build.
2. `assets`: Python 3.11 + Pillow + ffmpeg, rebuild register, fail on diff,
   validate assets, rebuild contrast report.

## 6. Design decisions and assumptions

- Two-track architecture: deterministic browser game now, agentic services behind
  ports later.
- No backend in Stage 3. Persistence is in-memory; refresh resets the session.
- Evidence is a fact namespace (`evidence.*`), not a sixteenth contract (ADR 0004).
- FNV-1a is a determinism/integrity check, not a signature (ADR 0005).
- Stage 3 action vocabulary is intentionally minimal; `fact.assert` accepts only
  `debug.*` facts so scaffold controls cannot invent story content.
- Anchors are limited to one per tick; fork records a child but does not switch
  the active branch.
- Deployment is assumed at the site root; font URLs are absolute under
  `public/assets/fonts`.

## 7. Known limitations

1. **Branch switching is not implemented.** `branch.fork` records ancestry; BLINK
   activation and V1/V2 comparison belong to Stage 6.
2. **No IndexedDB or SQL persistence.** Saves live in memory for this stage.
3. **Rule pass is single-pass.** No fixpoint or chained second-order effects.
4. **No NPC cognition.** `NpcObservation`, `NpcDecisionProposal`, `MemoryRecord`
   and `ModelManifest` are contracts and fixtures only.
5. **No story content.** Choices and endings have schemas but no authored nodes.
6. **`fact.assert` is debug-only** and confidence is fixed at 1 for action facts.
7. **Checksum is not cryptographic.** Local save integrity only.
8. **Phaser chunk warning.** Expected 1.37 MB separate chunk; revisit if startup
   budget requires it.
9. **Absolute font URLs assume root deployment.** A subpath deployment needs a
   base-path adjustment.
10. **Asset style integration is untested in-world.** Kenney/ansimuz coherence is
    a Stage 4 visual test, as agreed at Gate 1.

## 8. What is ready for Stage 4

- A stable `GameSession` for scenes to dispatch actions and read snapshots.
- Frozen events, facts, rules, anchors and branches.
- A documented save envelope ready for an IndexedDB adapter.
- Strict TypeScript, CI and purity checks to keep new gameplay code honest.
- Curated 16 px environment, character, audio and font assets with a manifest.
- Visual style guide and night-grade values.
- A passing asset pipeline.

Stage 4 can therefore focus on the vertical slice — map, movement, collision,
interaction and the first evidence/choice loop — without reopening contracts or
architecture. Contract changes discovered during play should be raised explicitly
and versioned, not patched ad hoc.

## 9. Stage 4 boundary

Not started and not authorised by this report: Tiled/map authoring, player
movement, collision, camera, interaction prompts, dialogue implementation, story
content, MORROW, ECHO, BLINK switching, IndexedDB/YSQL, Meko.

Stop point: this report and the Stage 3 commit. Await explicit Stage 4
authorisation.
