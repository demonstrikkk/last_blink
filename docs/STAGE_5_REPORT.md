# Stage 5 Report — Narrative and Causal Systems

Status: **complete, awaiting Stage 5 gate sign-off. Stage 6 has not started.**
Date: 2026-10-31
Version: 0.3.0 (content bundle `content.stage5.aster`)

## 1. Objective

Turn the Stage 4 slice into a coherent investigation whose outcomes are produced
by a documented, deterministic causal model: a three-act story, an evidence chain
with provenance, decisions that are evidence-informed by construction, delayed
consequences, relationship and scrutiny state, and reachable endings — without
adding an LLM, adaptive policy, BLINK switching or a database, and without giving
Phaser or React a second copy of game truth.

Delivered scope matches `docs/STAGE_5_PLAN.md` and the additive schema recorded in
ADR 0009.

## 2. What is playable

One street in Aster, unchanged in size, now carrying six interaction targets and
three acts.

| Act | Beat | Interaction | Canonical result |
|---|---|---|---|
| I — The gap | Read the Relay 7 log | North kerb terminal | `evidence.relay_7`; phase → `investigation` |
| I — The gap | Try to decide before reading | Sable | Conversation plays; decision sheet is an **evidence gate** naming `evidence.relay_7` |
| II — The chain | Decide what happens to the log | Sable | `story.relay_choice=share\|conceal`; derives `world.ward_alert`, `npc.sable.stance`, `npc.sable.trust`; phase → `decision` |
| II — The chain | Recover the dispatch slip | North walk board | `evidence.ward_dispatch`; delayed rules resolve `world.dispatch_continuity=unbroken\|severed` from the earlier decision |
| II — The chain | Hear Ivo | South walk stall | `evidence.vendor_testimony` (kind `testimony`); decision sheet opens |
| III — The accounting | Decide whether Ivo is named | Ivo | `story.vendor_choice=protect\|name`; derives `npc.ivo.stance`, `world.vendor_confidence`, `world.morrow_scrutiny`; phase → `accounting` |
| III — The accounting | Make the ward call | East walk call-box | `story.ward_call=file\|bury`; ending rule writes `story.ending_id`, emits `ending.reached`; phase → `resolved` |
| — | Checkpoint | Cyan lamp post | Engine anchor with the pre-event state hash |

Controls: arrows/WASD move; E or Space interact, advance and confirm; 1/2 choose;
Esc closes. Touch D-pad appears at ≤ 820 px.

### The Stage 4 narrative concern, resolved intentionally

Stage 4 allowed Sable's decision before the player had read the terminal, and its
report recorded that as a limitation. Stage 5 keeps the conversation but gates the
**decision** on `evidence.relay_7`, declared in content and enforced by
`validateAction`. The player hears Sable out, then the sheet explains the missing
fact. This makes the choice evidence-informed rather than intuitive, and it is
tested at the engine level, not just in the UI.

## 3. Architecture and decisions

- **Authority unchanged.** `GameSession` is the only writer. React dispatches
  actions; Phaser reports intents; neither mutates facts.
- **Gating is content + engine.** `requires` on evidence and choice nodes is
  checked in `validateAction`; a missing prerequisite returns the existing
  `invalid_action` code with `details.missing`. No new rejection code, event or
  contract version (ADR 0009).
- **Narrative structure is data.** Objectives and ending presentation are
  content arrays with Zod defaults. A Stage 4 bundle still parses.
- **Delayed effects are milestone-triggered.** Dispatch continuity cannot resolve
  until `evidence.ward_dispatch` exists; the rule then reads the earlier decision.
  No timers, no wall clock, no randomness.
- **Monotonic phase.** Each phase rule lists only earlier phases in its `in`
  guard and runs at a higher priority than the rule below it, so one ordered pass
  reaches the furthest phase and later passes cannot regress it.
- **Single projection.** `deriveWorldView(state, content)` now carries provenance,
  confidence, evidence availability, objective completion, per-decision
  availability and missing keys, the causal facts and the ending. Both renderers
  read it.
- **Provenance is visible.** Evidence facts keep `record`/`testimony` and their
  source ref; derived facts show `rule.<ruleId>`; the ledger prints both.
- **Dialogue is presentation.** Scripts may grant evidence only by dispatching
  `evidence.collect`; a gated script still plays and then shows the gate.

Full causal semantics: `docs/CAUSAL_MODEL.md`.

## 4. Acceptance matrix

| Gate requirement (Stage 5 plan §8) | Result | Evidence |
|---|---|---|
| Evidence facts carry provenance and confidence | Pass | `tests/stage5Engine.test.ts` provenance tests; ledger output |
| Prerequisite rejection is explicit and leaves facts unchanged | Pass | Prerequisite tests assert `invalid_action`, `details.missing` and unchanged canonical facts |
| Delayed dispatch-continuity effect applies only after the slip exists | Pass | Delayed-effect tests, including the no-re-derive case |
| Relationship, stance and scrutiny rules derive documented values | Pass | Relationship tests across share/conceal × protect/name |
| Phase progresses monotonically | Pass | Phase test asserts every step and survival across ticks |
| All three endings reachable; none before the ward call | Pass | Ending tests cover open record, quiet street (4 combinations) and both inquiry causes |
| A second ending is rejected by the engine | Pass | One `ending.reached` event; reducer keeps the first ending |
| Full path replays deterministically from the same seed | Pass | Canonical state equality across two sessions |
| Rule provenance visible in event log and ledger | Pass | `rule.evaluated` + `derived:rule.*` source refs in ledger |
| Stage 3 and Stage 4 tests remain green | Pass | 98/98 across 12 files; Stage 3/4 suites unmodified |
| Three-act narrative structure documented | Pass | `docs/STAGE_5_PLAN.md`, `docs/CAUSAL_MODEL.md` |
| Canonical causal variable catalogue documented | Pass | `docs/CAUSAL_MODEL.md` §2 |
| Decisions have deterministic delayed effects | Pass | Dispatch-continuity and scrutiny rules |
| NPC relationship/stance changes | Pass | Sable stance/trust, Ivo stance, vendor confidence |
| Ending conditions and reachable outcomes | Pass | Truth table in `docs/CAUSAL_MODEL.md` §7 |
| Event provenance for future ECHO | Pass | Every fact is event-sourced with `source` and `sourceEventId` |

## 5. Verification

All commands run from the repository root on Windows, Node 22.15.0, npm 11.7.0,
Python 3.11.15.

| Command | Exit | Output |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit`, no diagnostics |
| `npm test` | 0 | 12 files, **98/98 tests passed**, ~1.9 s |
| `npm run build` | 0 | 158 modules; app JS 411.86 kB (122.11 kB gzip); CSS 17.60 kB (4.13 kB gzip); Phaser chunk 1,367.86 kB (357.33 kB gzip) |
| `npm run verify` | 0 | typecheck + tests + production build |
| `python tools/assets/validate/build_register.py` | 0 | 46 assets, 0 changed, 2674.0 KiB shipped |
| `python tools/assets/validate/validate_assets.py` | 0 | PASS: 0 failures, 0 warnings |
| `python tools/assets/validate/check_catalogue_links.py` | 0 | 44 local references, 0 missing; tags balanced |
| `python tools/assets/validate/contrast_report.py` | 0 | report regenerated; body contrast unchanged at 7.37:1 |

New Stage 5 coverage: `tests/stage5Engine.test.ts` (26) and
`tests/stage5WorldView.test.ts` (5), 31 tests. No Stage 3 or Stage 4 test file was
modified.

### Runtime verification

No browser-test dependency was added. The slice was driven through Chrome 156
headless with the existing Chrome DevTools Protocol harness, served from the
production build (`vite preview`, port 4173, `/?debug=1`).

Desktop path, 1440 × 900:

1. Loaded the street; field notes showed 0/3 evidence, six objectives and a locked
   Sable decision (`◌ locked · evidence.relay_7`).
2. Walked to Sable **before** reading anything: the conversation played, then the
   sheet showed `EVIDENCE GATE`, Sable's refusal line and "Required before this
   decision: evidence.relay_7". No decision was committed.
3. Read the Relay 7 terminal; evidence count moved to 1/3, phase to
   `investigation`, and the dispatch board became available.
4. Talked to Sable again and chose share; phase to `decision`, ward alert
   `raised`, Sable `relieved` / `trusted`.
5. Read the dispatch slip; the delayed rule resolved continuity to `unbroken`.
6. Opened Ivo's script: testimony was recorded (2/3 → 3/3), then chose protect;
   phase to `accounting`, Ivo `protected`, vendor confidence `high`, scrutiny
   `elevated`.
7. Made the ward call and chose file; the ending sheet showed `The Open Record`
   with decision, ward alert, Sable, Ivo, dispatch chain and scrutiny.
8. Opened the ledger: state `v45`, tick 0, 3 evidence, 3 choices, ending
   `ending.open_record`, 22 facts, hash `25fa2eba4150d6d8`. Facts showed
   `record:record.relay_7.terminal`, `record:record.ward.dispatch_board`,
   `testimony:testimony.ivo.stall` and `derived:rule.rul_*` with source event IDs.
9. Recorded an anchor after the ending; the toast confirmed the checkpoint.
10. Repeated the route at 390 × 844: touch controls, narrow district, narrow
    ledger, narrow choice sheet and narrow ending sheet all rendered without
    horizontal overflow, and the same ending was reached.

Result: **0 console errors or warnings**.

Reference run values (desktop): phase steps `v9 → v14 → v26 → v45`, final ledger
`v45`, 22 facts, `ending.open_record`, hash `25fa2eba4150d6d8`.

### Screenshots

Desktop:

- `docs/stage5_district_start.png` — opening street with objectives and locked decisions
- `docs/stage5_gate.png` — evidence gate on Sable's decision
- `docs/stage5_evidence.png` — relay log collected, dispatch board unlocked
- `docs/stage5_choice.png` — Sable share/conceal decision
- `docs/stage5_dispatch.png` — dispatch slip recovered, continuity resolved
- `docs/stage5_ivo.png` — Ivo's testimony
- `docs/stage5_vendor_choice.png` — protect/name decision
- `docs/stage5_ward_choice.png` — ward call decision
- `docs/stage5_ending.png` — ending sheet with derived consequence grid
- `docs/stage5_after_ending.png` — field notes with ending panel and causal state
- `docs/stage5_ledger.png` — ledger facts with provenance

Narrow (390 × 844):

- `docs/stage5_district_narrow.png`, `docs/stage5_choice_narrow.png`,
  `docs/stage5_ward_narrow.png`, `docs/stage5_ending_narrow.png`,
  `docs/stage5_ledger_narrow.png`

## 6. Files added or changed

Engine and content:

- `src/engine/content/stage3Content.ts` — additive `sourceKind`/`requires`,
  `objectives`, `endings` on `gameContentSchema`; exports for the new types.
- `src/engine/core/validation.ts` — evidence and choice prerequisite checks with
  `invalid_action` + `details.missing`.
- `src/engine/session/gameSession.ts` — evidence facts use the definition's
  `sourceKind`.
- `src/content/stage5Content.ts` — 8 initial facts, 3 evidence items, 3 choice
  nodes, 6 objectives, 3 endings, ~25 rules.
- `src/content/stage5Dialogue.ts` — Sable, Ivo and ward call-box scripts, gate
  text, anchor label, district title.
- `src/session/runtime.ts` — composes the Stage 5 bundle.

World and rendering:

- `src/world/district.ts` — dispatch board and call-box cells, Ivo/ward-call
  targets, `decision` interaction kind.
- `src/world/worldView.ts` — provenance, availability, objectives, per-decision
  gating, causal fields and ending in the single projection.
- `src/game/DistrictScene.ts` — Ivo sprite and animation, new glows,
  `ending-sting` sfx.
- `src/App.tsx` — multi-script dialogue state machine (`lines`/`choice`/`blocked`/
  `resolved`), Ivo testimony grant, ending handling, phase chip.
- `src/ui/DialogueSheet.tsx` — gate panel, ending/consequence panel, role line.
- `src/ui/FieldNotes.tsx` — objectives, provenance, decisions, causal state,
  ending panel, evidence total.
- `src/ui/Ledger.tsx` — ending stat and fact provenance.
- `src/styles.css` — styles for the new surfaces.

Tests and docs:

- `tests/stage5Engine.test.ts` (26), `tests/stage5WorldView.test.ts` (5).
- `docs/STAGE_5_PLAN.md`, `docs/CAUSAL_MODEL.md`, this report.
- `docs/adr/0009-content-prerequisites.md`.
- Updates to `docs/ARCHITECTURE.md`, `docs/EVENT_MODEL.md`,
  `docs/CONTRACT_CATALOGUE.md`, `docs/IMPLEMENTATION_CHECKLIST.md`, `README.md`.
- `docs/stage5_*.png` screenshots.

## 7. Limitations and open risks

1. **CI still unverified.** No Git remote exists, so GitHub Actions has not run.
   Local `npm ci`, typecheck, tests, build and asset checks pass.
2. **Phaser bundle size.** The Phaser chunk is 1.37 MB (357 kB gzip). Acceptable
   for a single-page slice; code-splitting is future work.
3. **Root-deployment assumption.** Fonts and Phaser assets are requested from
   `/assets/...` while Vite uses a relative base; sub-path hosting would break
   them. The deployment target must be decided before release.
4. **In-memory only.** Refresh or restart resets the street. No persistent save;
   the UI says so. Player position is not saved.
5. **Prerequisites are a flat conjunction.** `requires` cannot express "any of",
   numeric thresholds or relationship conditions. Adding that means a content
   schema change and a new ADR.
6. **One street, fixed cast.** Three NPC/decision points, three evidence items,
   three endings. The map and facades are reused; Ivo is one additional sprite.
7. **Rules are one ordered pass, not a fixpoint.** Correct today because every
   derived rule is guarded, but a new rule that depends on a *later* rule in the
   same pass would need explicit priority work; there is no automatic convergence.
8. **Ending selection is priority-dependent by design.** `open_record` (51) is
   evaluated before `ward_inquiry` (50), so an intact chain and protected witness
   win even when scrutiny is elevated. This is intentional and documented, but a
   future ending must be tested against the whole truth table, not in isolation.
9. **Runtime checks are not committed.** The CDP harness lives outside the
   repository; CI does not run a browser. Adding Playwright or a committed CDP
   script is the natural next step when a remote exists.
10. **Hash is not a signature.** FNV-1a 64-bit is a determinism and integrity
    check, not collision-resistant against an adversary (ADR 0005).
11. **Tick display stays at 0.** Gameplay actions are event-driven; only
    `session.advance_tick` moves the tick. The HUD is truthful but can confuse a
    reader expecting a clock.
12. **Audio quality unverified by ear.** Loading, the new `ending-sting` clip,
    muting and playback were verified programmatically; mix balance was not
    auditioned on hardware.
13. **Touch verified in layout, not on hardware.** The D-pad and interact button
    render and share the movement/interaction path, but multi-touch quality was
    not measured on a physical device.

## 8. Gate request

Requesting Stage 5 sign-off on the basis of the acceptance matrix, the 98 passing
tests, the clean production build, the desktop and narrow browser play-throughs
with zero console errors, and the screenshots above.

No Stage 6 work — ECHO, MORROW policy, BLINK switching, persistence or the NPC
cognition runtime — will begin until this gate is accepted.

Stage 5 implementation commit: `<pending — recorded on commit>`.
