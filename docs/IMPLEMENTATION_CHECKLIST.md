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

## Gate 1 — awaiting inspection

- [x] Visual guide, asset register, licence notices, catalogue, validation results, acquisition report presented
- [x] `docs/GATE_1_REPORT.md` summarises deliverables, commands and open items
- [ ] Inspector sign-off
- [ ] Authorisation to begin map production

## Stage 3 — Contracts and repository freeze (after gate 1)

- [ ] Vite + React + TypeScript scaffold
- [ ] Zod schemas for event, fact, choice, rule, anchor, NPC, save, model manifest
- [ ] `EVENT_CATALOG.md`
- [ ] Ports: `NpcPolicy`, `MemoryStore`, `EventStore`
- [ ] ADRs for runtime, persistence, determinism, branch model
- [ ] CI skeleton

## Stage 4 — Deterministic playable game (after gate 1)

- [ ] Phaser scene, Tiled map, movement, collision, camera
- [ ] Interaction, evidence, dialogue, choices
- [ ] Rules, facts, causal graph, anchors
- [ ] Save/reload, BLINK branch, scar memory
- [ ] ECHO templates and ending decision table
- [ ] Heuristic MORROW and fairness guard
- [ ] Tests: unit, replay, branch isolation, E2E

## Stage 5 — Jaya NPC pipeline (third gate)

- [ ] Shared cognition runtime and context builder
- [ ] `LocalMemoryStore`
- [ ] Scripted policy and proposal validator
- [ ] Memory isolation tests
- [ ] Fallback tests
- [ ] Three scripted scenarios

## Later

- [ ] YSQL/remote services behind ports
- [ ] Remaining NPCs
- [ ] PPO MORROW with parity and fairness gates
- [ ] Stress, accessibility, performance, release
