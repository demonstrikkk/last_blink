# Implementation Checklist

Status legend: `[ ]` not started · `[~]` in progress · `[x]` complete and verified · `[!]` blocked

## Stage 0 — Visual direction

- [x] `docs/VISUAL_STYLE_GUIDE.md` with palette, grid, perspective, lighting, UI rules
- [x] Reference board generated from the palette and sample assets (`docs/visual_reference_board.png`)
- [x] Contrast ratios computed and recorded (`docs/contrast_report.md`, worst case 7.37:1 for body text)
- [x] V1/V2, ECHO, MORROW, evidence-state visual languages defined
- [x] Accessibility rules defined (colour independence, reduced motion, keyboard focus)

## Stage 1 — Asset discovery and acquisition

- [x] `docs/ASSET_SOURCING.md` with candidates, decisions, rejected assets
- [x] `docs/ASSET_REGISTER.csv` with source, creator, licence, attribution, version, hash, usage
- [x] `docs/THIRD_PARTY_NOTICES.md`
- [x] `assets/raw/` originals preserved (5 archives, all hashed)
- [x] `assets/licenses/` licence files preserved verbatim (6 texts)
- [x] One environment tileset acquired and inspected (Kenney Roguelike Modern City, 37×28 tiles)
- [x] One character pack with authored animation acquired and inspected (ansimuz, 7 roles × 2 frames)
- [x] 24 sound effects acquired (Kenney Interface + Sci-Fi)
- [x] 3 music loops acquired (ansimuz)
- [x] Two OFL fonts acquired with licence files
- [x] Lucide recorded for later npm installation
- [x] Caps respected: 1 environment pack, 1 character pack, 2.61 MiB shipped of 20 MiB

## Stage 2 — Asset validation and catalogue

- [x] `tools/assets/discover/verify_sources.py` (6/6 live source pages verified)
- [x] `tools/assets/download/fetch_kenney.py` (signed-URL flow, hash-pinned, idempotent)
- [x] `tools/assets/download/fetch_direct.py`
- [x] `tools/assets/validate/build_register.py`
- [x] `tools/assets/validate/validate_assets.py`
- [x] `tools/assets/validate/contrast_report.py`
- [x] `tools/assets/validate/check_catalogue_links.py` (44/44 local references resolve)
- [x] `tools/assets/catalogue/build_catalogue.py`
- [x] `tools/assets/catalogue/build_reference_board.py`
- [x] Validation report generated and passing (`docs/VALIDATION_REPORT.md`, 0 failures)
- [x] HTML catalogue generated and inspectable (`docs/asset_catalogue.html`)
- [x] Duplicate, orphan and unused-file checks pass
- [x] Re-running the pipeline does not duplicate or corrupt assets (`0 changed` on second run)
- [x] Commands and results recorded

## Gate 1 — inspected and accepted

- [x] Visual guide, asset register, licence notices, catalogue, validation results, acquisition report presented
- [x] `docs/GATE_1_REPORT.md` summarises deliverables, commands and open items
- [x] Inspector sign-off (Stages 0–2 accepted, subject to clean Git baseline)
- [x] Clean foundation commit `2f3c710` with 95 tracked files
- [x] Authorisation to begin Stage 4

## Stage 3 — Engineering foundation

- [x] Git baseline, `.gitignore`, `.gitattributes`, pinned dependencies and lockfile
- [x] Strict TypeScript configuration (`tsc --noEmit` clean)
- [x] Vite + React + Phaser scaffold; Phaser isolated behind a dynamic import
- [x] Pure deterministic engine runnable in Node without a browser
- [x] Fifteen frozen contracts with Zod schemas, owners, versions and fixtures (`docs/CONTRACT_CATALOGUE.md`)
- [x] Runtime validation at every action, event, save and content boundary
- [x] `GameSession` with dispatch, snapshots, anchors, forks, save and restore
- [x] Ports and deterministic mocks: clock, policy, persistence, content, logger
- [x] Event model and save checksum documented (`docs/EVENT_MODEL.md`)
- [x] ADRs for authority, runtime, contracts, evidence, hashing, ports and UI state
- [x] 36 Vitest checks: contracts, round-trip, determinism, session, saves, purity
- [x] CI for install, type-check, tests, build and asset-pipeline integrity
- [x] Asset pipeline re-run with 0 failures and 0 changed assets
- [x] `docs/STAGE_3_REPORT.md` with commands, outputs and limitations
- [x] Stage 3 acceptance gate reached; Stage 4 not started

## Stage 4 — First playable vertical slice

- [x] Code-authored Aster street grid (48 × 22 tiles) with solid buildings, kerbs, road paint and props
- [x] Phaser scene: baked ground, night grade, lamp glows, vignette, camera bounds and deadzone
- [x] Fixed-step movement (1/60 s), axis-separated collision, facing, walk/idle animation
- [x] Generic interaction range/priority, DOM prompt and keyboard/touch interact
- [x] Relay 7 evidence collection through `evidence.collect`, duplicate guard
- [x] Scripted Sable conversation, accessible dialogue sheet, choice via `choice.make`
- [x] Choice effects write canonical facts; rules derive `world.ward_alert` and `npc.sable.stance`
- [x] Anchor at the cyan lamp post; available once and validated by the engine
- [x] Field notes and ledger read the single canonical projection
- [x] Restart/reload copy is explicit about the in-memory session
- [x] 67 Vitest checks across 10 files; runtime play-through verified in headless Chrome
- [x] Desktop and narrow screenshots captured (`docs/stage4_*.png`)
- [x] Asset pipeline re-run: 46 assets, 0 changed, validator clean, 44/44 links
- [x] `docs/STAGE_4_REPORT.md` with commands, acceptance matrix and limits
- [x] Stage 4 gate sign-off (`efe1c70`, report follow-up `96e627a`)

Deferred beyond Stage 4:

- [ ] Persistent save/reload, BLINK branch switching, scar memory
- [ ] ECHO retrieval/templates and the ending decision table
- [ ] Heuristic MORROW, fairness guard, multiple NPCs
- [ ] Branch isolation, replay and end-to-end suites beyond the current unit/runtime checks

## Stage 5 — Narrative and causal systems

- [x] `docs/STAGE_5_PLAN.md`: three acts, evidence chain, decisions, endings, acceptance tests
- [x] Additive content schema: `requires`, `sourceKind`, `objectives`, `endings`; no contract bump (ADR 0009)
- [x] Engine-enforced prerequisites for evidence and decisions (`invalid_action` + `details.missing`)
- [x] Evidence provenance: record/testimony kind, source ref and confidence on every evidence fact
- [x] Three evidence items with a gated chain (relay log → dispatch slip → Ivo's testimony)
- [x] Three consequential decisions: Sable share/conceal, Ivo protect/name, ward call file/bury
- [x] Deterministic delayed effect: dispatch continuity resolves only after the slip exists
- [x] Relationship and stance facts: Sable stance/trust, Ivo stance, vendor confidence, MORROW scrutiny
- [x] Monotonic story phase: arrival → investigation → decision → accounting → resolved
- [x] Six objectives derived from canonical facts; current objective surfaced in field notes
- [x] Three reachable endings with rule-owned `ending.reached`; second ending rejected by the engine
- [x] Sable's decision intentionally gated on `evidence.relay_7`, settling the Stage 4 soft-gate limitation
- [x] Extended street: dispatch board, Ivo, ward call-box; Ivo sprite, glows, ending sting
- [x] UI: objectives, provenance, causal state, decisions, gate panel, ending panel, multi-script dialogue
- [x] `docs/CAUSAL_MODEL.md`: variable catalogue, transitions, provenance, ending truth table
- [x] 98 Vitest checks across 12 files; Stage 3 and Stage 4 suites unchanged and green
- [x] Runtime play-through verified at desktop and 390 × 844 in headless Chrome, 0 console errors
- [x] Desktop and narrow screenshots captured (`docs/stage5_*.png`)
- [x] Asset pipeline re-run: 46 assets, 0 changed, validator clean, 44/44 links
- [x] `docs/STAGE_5_REPORT.md` with commands, acceptance matrix and limits
- [ ] Stage 5 gate sign-off

Deferred beyond Stage 5:

- [ ] NPC cognition runtime, memory store and scripted/LLM policy pipeline (Jaya pipeline)
- [ ] ECHO retrieval, MORROW adaptive policy, BLINK switching
- [ ] Persistent save/reload and multi-branch timelines

## Later

- [ ] YSQL/remote services behind ports
- [ ] Remaining NPCs
- [ ] PPO MORROW with parity and fairness gates
- [ ] Stress, accessibility, performance, release
