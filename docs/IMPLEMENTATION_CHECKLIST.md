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

- [x] BLINK branch switching and scar memory (Stage 6); persistent save/reload remains deferred
- [x] ECHO retrieval/templates (Stage 8) and the ending decision table (Stage 5)
- [x] Heuristic MORROW and fairness guard (Stage 7); multiple NPCs remain deferred
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
- [x] Stage 5 gate sign-off (`26b1b9d`, `8b03a48`)

Deferred beyond Stage 5:

- [ ] NPC cognition runtime, memory store and scripted/LLM policy pipeline (Jaya pipeline)
- [x] ECHO retrieval and deterministic MORROW policy (Stages 7-8); learned policy remains deferred

## Stage 6 — Real timeline branching

- [x] `docs/STAGE_6_PLAN.md`: fork contract, session surface, scar rule, UI, acceptance tests
- [x] Additive `Branch` fork-point fields (`forkedAtEventSequenceNo`, `forkedAtStateHash`); no contract bump (ADR 0013)
- [x] Reducer validates fork coordinates against the anchor checkpoint
- [x] Child state materialised from the parent's retained history at the anchor version
- [x] `forkTimeline`, `switchBranch`, `listBranches`, `getBranchState/Hash`, `getActiveBranchId`, `compareBranches`, `getLineageEvents`
- [x] Switching is a pointer move with no event and no mutation on failure
- [x] Scar allowlist: only `scar.*` facts asserted after the checkpoint cross, as explicit events (ADR 0014)
- [x] Ancestry stops at the fork point; child events tagged and separated in the ledger
- [x] Comparison derived from canonical states and lineage logs only
- [x] BLINK panel: timelines, hashes, checkpoints, fork actions, comparison; topbar timeline chip is live
- [x] Field notes and ledger surface timeline, checkpoint, lineage and per-event branch tags
- [x] Scene loads and plays `blink` and `timeline-shift` on fork and switch
- [x] 108 Vitest checks across 13 files; Stage 3, 4 and 5 suites unchanged and green
- [x] Runtime play-through at desktop and 390 × 844: fork, diverge, switch back, compare, 0 console errors
- [x] Desktop and narrow screenshots captured (`docs/stage6_*.png`)
- [x] `docs/STAGE_6_REPORT.md` with commands, acceptance matrix, isolation evidence and limits
- [ ] Stage 6 gate sign-off

Deferred beyond Stage 6:

- [ ] Persistent per-branch save/reload (current restore retains only the active branch)
- [x] ECHO retrieval and deterministic MORROW policy (Stages 7-8)
- [ ] Learned/PPO MORROW, LLM ECHO, NPC cognition runtime
- [ ] YugabyteDB, Meko and remote services behind ports

## Later

- [ ] YSQL/remote services behind ports
- [ ] Remaining NPCs
- [ ] PPO MORROW with parity and fairness gates
- [ ] Stress, accessibility, performance, release

## Stage 7 - MORROW bounded policy

- [x] `docs/STAGE_7_PLAN.md`: observation, policy, fairness, controller, acceptance tests
- [x] Additive runtime MORROW contracts outside the save registry (ADR 0016)
- [x] Additive `morrow.proposal.evaluated` and `morrow.intervened` event variants
- [x] `morrow.intervene` action accepted only from `system_morrow`
- [x] Engine-enforced freshness, duplicate, transition, ceiling and ending fairness
- [x] Deterministic baseline policy plus throwing-policy fallback and posture skip
- [x] Branch-scoped observation; no cross-timeline reads
- [x] Three derived facts: `morrow.response`, `morrow.last_proposal`, `morrow.escalation`
- [x] UI MORROW callout after accepted evidence and decision actions
- [x] 10 Stage 7 tests in `tests/stage7Morrow.test.ts`
- [x] `docs/MORROW_POLICY_MODEL.md`

## Stage 8 - ECHO branch-aware retrieval

- [x] `docs/STAGE_8_PLAN.md`: query model, citations, scope rule, acceptance tests
- [x] `EchoService` read-only, typed queries, no dispatch and no fact writes
- [x] Single-branch scope via `getBranchState` + `getLineageEvents`
- [x] Comparison only through `compareBranches`
- [x] Grounded/partial/unknown status; citations on every substantive claim
- [x] Unknown facts, decisions and endings return explicit `missing` evidence
- [x] Child branch cannot see parent post-fork discoveries
- [x] ECHO panel with query controls and citation list
- [x] 10 Stage 8 tests in `tests/stage8Echo.test.ts`
- [x] `docs/ECHO_RETRIEVAL_MODEL.md`
- [x] 128 Vitest checks across 15 files; Stage 3-6 suites unchanged and green
- [x] `npm run verify` green (typecheck, tests, production build)
- [x] Implementation `867dff1`, docs `89a34e4`; remote CI `41210187574` green
- [ ] Combined Stage 7-8 gate sign-off
- [ ] Automated ECHO/MORROW screenshots (tooling not installed in this environment)

Deferred beyond Stage 8:

- [ ] LLM-backed ECHO, embeddings/vector retrieval
- [ ] Learned/PPO MORROW policy with parity and fairness evaluation
- [ ] NPC cognition runtime, persistent per-branch saves, YugabyteDB and Meko

