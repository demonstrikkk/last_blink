# Stage 4 Report — The First Playable Vertical Slice

Status: **complete, awaiting Stage 4 gate sign-off. Stage 5 has not started.**
Date: 2026-10-31
Version: 0.2.0

## 1. Objective

Turn the Stage 3 foundation into one playable, coherent street: walkable Aster
district, deterministic movement and collision, a follow camera, evidenced
interaction, one scripted conversation, one consequential choice that changes
canonical state, and one valid engine anchor — without giving Phaser or React a
second copy of game truth.

Delivered scope matches the Stage 4 plan (`docs/STAGE_4_PLAN.md`, items 4.1–4.8).

## 2. What is playable

One street in Aster, 48 × 22 tiles, rendered at a 512 × 288 logical resolution.

| Beat | Interaction | Result |
|---|---|---|
| Investigate | Relay 7 terminal on the north kerb | `evidence.collect` writes `evidence.relay_7`; a rule derives `story.relay_ready`; field notes flips to 1/1 |
| Converse | Sable on the south walk | Four scripted lines in an accessible dialogue sheet |
| Decide | Choice node `node.sable.relay` | `choice.make` writes `story.relay_choice`; rules derive `world.ward_alert` (`raised`/`suppressed`) and `npc.sable.stance` (`relieved`/`guarded`) |
| Checkpoint | Cyan lamp post on the south walk | `anchor.record` stores an anchor with the pre-event state hash; target then retires |

The consequence is visible in three places at once, all from one projection:
field notes, the dialogue consequence panel and the ledger facts. The state hash
changes, the event log records `choice.made` + `fact.asserted`, and the HUD
updates without a reload.

Controls: arrows/WASD move; E or Space interact, advance and confirm; 1/2 choose;
Esc closes. Touch D-pad and interact button appear at ≤ 820 px.

## 3. Architecture and decisions

- **Authority unchanged.** `GameSession` remains the only writer. Phaser reports
  intents; React composes actions. Neither mutates facts.
- **Presentation state is not canonical.** Player position, facing, camera,
  proximity and dialogue cursor live outside `GameState`, are not saved, hashed or
  replayed.
- **Movement is deterministic and render-independent.** Fixed 1/60 s steps with a
  carried accumulator; collision is axis-separated, so wall sliding falls out
  without Arcade Physics.
- **Single projection.** `deriveWorldView(state, content)` feeds field notes, the
  dialogue sheet, the ledger and the scene markers. There is no parallel story
  store.
- **Trusted content owns fact writes.** `evidence.collect` and `choice.make` take
  only an ID; fact keys and values come from `GameContent`.
- **Additive action vocabulary.** Two new actions reuse the frozen
  `fact.asserted` and `choice.made` payloads; no contract version bump. Recorded
  in ADR 0008. NPC contracts use a narrower action schema, so they did not widen.
- **Duplicate guards.** Re-collecting the same evidence or re-committing the same
  choice node is rejected with `duplicate` and audited.
- **Map in code, not Tiled.** A reviewable char grid, a baked ground canvas, and
  manual collision keep the dependency graph small and the engine headless.
- **Audio is opt-in.** Music starts on the first key, has a mute toggle, and all
  clips come from the existing CC0 pack.

## 4. Acceptance matrix

| Gate requirement | Result | Evidence |
|---|---|---|
| Walkable district; movement and facing | Pass | Play-through; `tests/worldMovement.test.ts` |
| Collision (buildings, props, world bounds) | Pass | Axis-separated collision; tests; runtime blocked by south buildings |
| Follow camera with world bounds and deadzone | Pass | `startFollow` + `setBounds` + `setDeadzone`; camera clamps at street edges |
| At least one interactable with prompt | Pass | Three targets; DOM prompt appears only in range |
| One evidence item | Pass | Relay 7; field notes 1/1 after collection |
| One scripted NPC conversation | Pass | Sable, four lines, accessible dialog |
| One consequential choice | Pass | Share / conceal at `node.sable.relay` |
| Choice changes a visible canonical fact | Pass | `world.ward_alert` raised/suppressed shown in notes and ledger |
| One valid engine anchor | Pass | Lamp post anchor; hash `380c300b1581a9c5` in the reference run; engine-validated |
| HUD / dialogue / evidence UI | Pass | Topbar, field notes, dialogue sheet, ledger drawer, touch pad |
| Movement and collision tests | Pass | 9 tests |
| Interaction range tests | Pass | 6 tests |
| Duplicate evidence and choice idempotency | Pass | 11 engine tests include both guards |
| State consistency | Pass | 5 world-view tests; one projection for both renderers |
| Phaser and React show the same state | Pass | Evidence target retires, anchor target retires, consequence text comes from facts in both surfaces |
| Reload/reset clearly communicated | Pass | Status bar and ledger: “In-memory session — refreshing restarts the street” |
| No console errors | Pass | Headless run: 0 errors/warnings, only the Phaser banner log |
| Actually playable | Pass | Full evidence → dialogue → choice → anchor flow driven in a real browser |

## 5. Verification

All commands run from the repository root on Windows, Node 22.15.0, npm 11.7.0,
Python 3.11.15.

| Command | Exit | Output |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit`, no diagnostics |
| `npm test` | 0 | 10 files, **67/67 tests passed**, ~1.6 s |
| `npm run build` | 0 | 158 modules; app JS 391.12 kB (117.77 kB gzip); Phaser chunk 1,367.86 kB (357.33 kB gzip) |
| `npm run verify` | 0 | typecheck + tests + production build |
| `python tools/assets/validate/build_register.py` | 0 | 46 assets, 0 changed, 2674.0 KiB shipped |
| `python tools/assets/validate/validate_assets.py` | 0 | PASS: 0 failures, 0 warnings |
| `python tools/assets/validate/check_catalogue_links.py` | 0 | 44/44 local references, tags balanced |
| `python tools/assets/validate/contrast_report.py` | 0 | report regenerated; body contrast unchanged at 7.37:1 |

### Runtime verification

The `playwright` npm package is not installed in this repository, so no browser
test dependency was added. The slice was driven through Chrome 156 headless with
a small Chrome DevTools Protocol harness (Node 22 global `WebSocket`), served from
the production build (`vite preview`, port 4173):

1. Loaded `/?debug=1`; waited for the scene and the DOM shell.
2. Collected Relay 7; field notes moved to 1/1, toast fired, facts grew to include
   `evidence.relay_7` and the derived `story.relay_ready`.
3. Walked to Sable; prompt appeared; dialogue advanced with E; choice sheet
   rendered; `1` committed “share”.
4. Consequence sheet reported `ward alert: raised`, `Sable: relieved`,
   `decision: share`; ledger showed the derived facts and `choice.made` event.
5. Walked to the lamp post; anchor recorded; the anchor prompt retired.
6. Repeated at 390 × 844; touch controls displayed, no horizontal overflow.
7. Confirmed 0 console errors/warnings, Web Audio `running`, music playing after
   the first input, textures loading with no missing-frame warnings.

Reference run values: evidence state `v7`, choice `v10`, anchor `v14`, ledger
evidence 1 / choices 1 / anchors 1, ledger hash `514051a5a7ae1de5`, anchor hash
`380c300b1581a9c5`.

### Screenshots

- `docs/stage4_district.png` — desktop street with evidence collected and prompt
- `docs/stage4_choice.png` — consequential choice sheet
- `docs/stage4_consequence.png` — derived consequence panel
- `docs/stage4_anchor.png` — anchor recorded
- `docs/stage4_district_narrow.png` — 390 × 844 with touch controls
- `docs/stage4_choice_narrow.png` — narrow choice sheet

## 6. Files added or changed

Engine and content:

- `src/engine/contracts/primitives.ts`, `src/engine/core/actions.ts`,
  `src/engine/core/validation.ts`, `src/engine/session/gameSession.ts`,
  `src/engine/content/stage3Content.ts`, `src/engine/contracts/npcDefinition.ts`,
  `src/engine/contracts/npcDecisionProposal.ts` — action extension, content schema,
  dispatch, duplicate guards, rule pass.
- `src/content/stage4Content.ts`, `src/content/stage4Dialogue.ts` — facts, rules,
  evidence, choice, script.

World and rendering:

- `src/world/district.ts`, `src/world/movement.ts`, `src/world/interaction.ts`,
  `src/world/worldView.ts` — map grid, solidity, fixed-step movement, range,
  canonical projection.
- `src/game/DistrictScene.ts`, `src/game/PhaserHost.tsx` — scene, baked ground,
  props, camera, markers, audio, debug hook.
- `src/App.tsx`, `src/ui/DialogueSheet.tsx`, `src/ui/FieldNotes.tsx`,
  `src/ui/Ledger.tsx`, `src/ui/TouchControls.tsx`, `src/styles.css` — game shell
  and accessible surfaces.
- `src/session/runtime.ts`, `index.html` — content injection, favicon.

Tests and docs:

- `tests/stage4Engine.test.ts` (11), `tests/worldMovement.test.ts` (9),
  `tests/interaction.test.ts` (6), `tests/worldView.test.ts` (5).
- `docs/adr/0008-action-vocabulary-extension.md`, `docs/STAGE_4_PLAN.md`,
  this report, plus updates to architecture, event model, contract catalogue,
  implementation checklist and README.

## 7. Limitations and open risks

1. **CI still unverified.** No Git remote exists, so GitHub Actions has not run.
   Local `npm ci`, typecheck, tests, build and asset checks pass.
2. **Phaser bundle size.** The Phaser chunk is 1.37 MB (357 kB gzip). Acceptable
   for a single-page game slice; code-splitting or a lighter runtime is future
   work.
3. **Root-deployment assumption.** Assets and fonts are requested from
   `/assets/...` while Vite uses a relative base. Serving from a sub-path would
   break font and Phaser asset URLs; deployment target must be decided before
   release.
4. **In-memory only.** Refresh or restart resets the street. The UI says so; there
   is no persistent save, and player position is not saved.
5. **Deferred systems.** BLINK switching, scar memory, ECHO retrieval/LLM
   dialogue, MORROW policy/PPO, YugabyteDB, Meko, Node backend/auth and multiple
   cognition runtimes are not implemented, by design.
6. **Narrative gating.** Sable’s conversation and the choice are available even
   if the player skipped reading the terminal, because Sable states the relay’s
   contents. The objective still recommends reading first. A hard gate would need
   a dialogue variant and a content-level requirement.
7. **One street, limited content.** One evidence item, one NPC, one choice and
   one anchor. Visual repetition in facades and roofs is visible on long walks;
   cars were omitted because the single-tile prop projection cannot compose the
   2 × 2 vehicle sprites cleanly.
8. **Runtime checks are not committed.** The CDP verification harness lives
   outside the repository; CI does not yet run a browser. Adding Playwright (or a
   committed CDP script) is the natural next step when a remote exists.
9. **Hash is not a signature.** FNV-1a 64-bit is a determinism and integrity
   check, not collision-resistant against an adversary (ADR 0005).
10. **Tick display stays at 0.** Gameplay actions are event-driven and do not
    advance the logical tick; only `session.advance_tick` does. The HUD is
    truthful but could confuse a reader expecting a wall-clock counter.
11. **Audio quality unverified by ear.** Loading, unmuted playback and the mute
    path were verified programmatically; mix balance was not auditioned on
    hardware.
12. **Touch verified in layout, not on hardware.** The D-pad renders and is wired
    to the same movement input, but multi-touch gesture quality was not measured
    on a physical device.

## 8. Gate request

Requesting Stage 4 sign-off on the basis of the acceptance matrix, the 67 passing
tests, the production build and the browser play-through above. No Stage 5 work
will begin until this gate is accepted.

Stage 4 implementation commit: `efe1c70`.
