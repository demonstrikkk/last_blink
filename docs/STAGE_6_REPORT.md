# Stage 6 Report - Real Timeline Branching

Status: **complete, awaiting Stage 6 gate sign-off. Stage 7 has not started.**
Date: 2026-10-31
Version: 0.4.0 (content bundle `content.stage5.aster`, unchanged)

## 1. Objective

Make BLINK a real fork of canonical state rather than a visual rewind:

- record an anchor, fork from it, and get a second timeline that starts at that
  checkpoint;
- leave the original timeline byte-identical except for the ancestry event;
- switch between timelines in both directions with verified state hashes;
- keep ancestry explicit and stop it at the fork point;
- let only scar memory cross the fork;
- compare timelines from canonical data only;
- let no failed operation partially mutate either timeline.

No LLM, no LLM memory, no MORROW/PPO policy, no YugabyteDB or Meko, and no
UI-only rewind. Delivered scope matches `docs/STAGE_6_PLAN.md`, ADR 0013 and
ADR 0014.

## 2. What changed

### Engine

| Area | Change |
|---|---|
| `contracts/branch.ts` | additive `forkedAtEventSequenceNo`, `forkedAtStateHash`; `forkedAtStateVersion`/`forkedAtTick` re-described as the checkpoint; refine still requires all-or-none fork metadata |
| `core/reducer.ts` | `branch.forked` validates every fork coordinate against the anchor: safe, present, in the past, version/tick/sequence/hash equal |
| `session/branching.ts` | new pure module: ancestry chain, re-scope, scar collection, lineage events, branch summaries, canonical comparison |
| `session/gameSession.ts` | per-branch runtimes `{state, hash, history, events}`; fork materialises the child from parent history, injects scars; new read/switch/compare APIs |
| `core/validation.ts` | `fact.assert` accepts `scar.*` in addition to `debug.*`; all other namespaces still refused |
| `engine/index.ts` | exports the branching module |

### Session surface

```ts
forkTimeline(anchorId, label): { result, branchId }
switchBranch(branchId): BranchSwitchResult   // no event, no mutation on failure
listBranches(): BranchSummary[]
getBranchState(branchId) / getBranchHash(branchId) / getActiveBranchId()
compareBranches(baseId, otherId): BranchComparison
getLineageEvents(branchId?): GameEvent[]
```

`BranchSwitchResult.code` is `unknown_branch`, `already_active`,
`stale_snapshot` or `hash_mismatch`; `status` is `switched` or `rejected`.

### UI

| Surface | Change |
|---|---|
| Topbar | live `V*N*/*total*` button, new `BLINK` button |
| `ui/BlinkPanel.tsx` | timeline cards with state version, tick, facts, events, ending, hash and checkpoint; anchor list with `BLINK from here`; comparison section (shared/only/changed facts, decisions, outcomes, event overlap, scars) |
| `ui/FieldNotes.tsx` | timeline block; anchor ID, checkpoint version and event sequence; `forked into` |
| `ui/Ledger.tsx` | timeline lineage chain with fork coordinates and per-event branch tags |
| `world/worldView.ts` | `TimelineView`, richer `AnchorView`, `forkedInto` |
| `game/DistrictScene.ts` | loads and plays `blink` and `timeline-shift` on fork and switch |
| `styles.css` | BLINK panel, timeline cards, comparison and lineage styles, responsive at 720/480 px |
| `App.tsx` | BLINK wiring, timeline chip, fork/switch handlers, comparison state, lineage events to the ledger |

### Docs

`STAGE_6_PLAN.md`, ADR 0013, ADR 0014, `ARCHITECTURE.md` (status, §9b, failure
table, limits), `EVENT_MODEL.md` (§8), `CONTRACT_CATALOGUE.md` (Branch),
`CAUSAL_MODEL.md` (branch scope and scars), `IMPLEMENTATION_CHECKLIST.md`,
`README.md`.

## 3. Isolation model

1. The fork point is the anchor checkpoint: version, tick, event sequence and
   hash are recorded on the child branch and validated against the anchor.
2. The child state is `parent.history[anchor.stateVersion]`, re-scoped to the
   child. Facts, choices and anchors keep their IDs and provenance; only the
   owning `branchId` changes, because `gameStateSchema` requires state entities
   to belong to the state's branch.
3. Post-checkpoint facts, choices, anchors and events are excluded by
   construction, not by filtering after the fact.
4. The parent's only write is the `branch.forked` event.
5. Forking does not activate the child; the UI then calls `switchBranch`.
6. A switch re-hashes the retained state before moving the active pointer and
   writes nothing. A refusal returns the previous snapshot untouched.
7. Only `scar.*` facts asserted after the checkpoint cross, each as an explicit
   `fact.asserted` event with `source.ref: scar.carry:<key>` (ADR 0014).

## 4. Acceptance matrix

All Stage 6 acceptance items are covered by `tests/stage6Branching.test.ts`
(10 tests) and, where stated, by the browser play-through.

| # | Acceptance item | Evidence | Result |
|---|---|---|---|
| 1 | Fork from an anchor creates a child at the checkpoint | `creates a child timeline at the anchor checkpoint and leaves the parent active` | pass |
| 2 | V1 unchanged except the ancestry event | same test: parent stays active, only branch count changes; child fork fields equal anchor fields | pass |
| 3 | Child has checkpoint facts, not later parent discoveries | `gives the child exactly the checkpoint facts...` | pass |
| 4 | Switch both ways with verified hashes | `switches to the child, diverges, and restores both hashes exactly` | pass |
| 5 | Divergence comparison from canonical data | `derives comparison from canonical states, not a parallel copy` | pass |
| 6 | Ancestry/fork cutoff | `separates shared ancestor events from branch-specific events` | pass |
| 7 | Scars-only crossing | `carries only scar.* facts across the fork` | pass |
| 8 | Invalid anchor and repeated fork | `rejects a fork from an anchor whose checkpoint cannot be reproduced` (`unknown_target`, `duplicate`) | pass |
| 9 | Stale snapshot and failed switch | `fails safely: rejected switches leave the active snapshot untouched`; `reports a stale snapshot when a restored session has no retained branch state` | pass |
| 10 | Forked timeline stays playable to a different ending | `keeps a forked timeline playable through a different ending` (`ending.open_record`) | pass |
| 11 | Stage 3-5 tests still pass | full suite, 13 files, 108/108 | pass |
| 12 | Full BLINK experience at desktop and mobile | browser play-through below, 0 console errors | pass |

## 5. Verification

### Commands actually run

```text
npm run verify
  tsc --noEmit          clean
  vitest run            13 files, 108/108 passed
  vite build            431.38 kB app + 1,367.86 kB Phaser, built in 1.13s

npx vitest run tests/stage6Branching.test.ts --reporter=verbose
  Test Files  1 passed (1)
  Tests       10 passed (10)

python tools/assets/prepare/extract_cached.py
  0 extracted, 4 cached, 0 failure(s)
python tools/assets/validate/build_register.py
  46 assets, 0 changed, 2673.8 KiB shipped
git diff --exit-code -- docs/ASSET_REGISTER.csv docs/asset_index.json public/assets
  exit 0
python tools/assets/validate/validate_assets.py
  PASS: 0 failure(s), 0 warning(s)
python tools/assets/validate/check_catalogue_links.py
  all tags balanced, local references resolve
```

### Stage 6 test output

```text
✓ stage 6 - fork from an anchor > creates a child timeline at the anchor checkpoint and leaves the parent active
✓ stage 6 - fork from an anchor > gives the child exactly the checkpoint facts, not the parent’s later discoveries
✓ stage 6 - fork from an anchor > rejects a fork from an anchor whose checkpoint cannot be reproduced
✓ stage 6 - switching timelines > switches to the child, diverges, and restores both hashes exactly
✓ stage 6 - switching timelines > fails safely: rejected switches leave the active snapshot untouched
✓ stage 6 - switching timelines > reports a stale snapshot when a restored session has no retained branch state
✓ stage 6 - ancestry and scar memory > separates shared ancestor events from branch-specific events
✓ stage 6 - ancestry and scar memory > carries only scar.* facts across the fork
✓ stage 6 - ancestry and scar memory > derives comparison from canonical states, not a parallel copy
✓ stage 6 - ancestry and scar memory > keeps a forked timeline playable through a different ending
```

### Remote CI

```text
gh run list --limit 3
  41204915349  a1c9209  feat(stage6): real timeline branching  success
  41201289746  88a167f  docs(stage5): record green remote CI run    success
  41201157399  6ecf9d8  fix(assets): make register output ...        success

gh run view 41204915349
  Asset pipeline integrity      success
  Typecheck, tests and build    success
```

### Runtime verification

Headless Chrome against the production build (`vite preview :4173`,
`?debug=1`), driven over CDP. Walking and interaction use the real scene and the
real engine; nothing was written into state from the script.

Desktop, 1440 x 900:

| Step | Observed |
|---|---|
| Record anchor after reading Relay 7 | anchor checkpoint v14, event 15, hash `6f1c33d763c30f6f`; V1 hash `33c1546cdf333f34` after the fork event |
| Fork from the anchor | V2 active, state v14, 10 facts, 14 events; checkpoint line names anchor `anc_0fdb10_000u` v14 event 15 hash `6f1c33d763c30f6f`; V1 moved to v16 / `33c1546cdf333f34` from the single `branch.forked` event |
| Compare at the fork point | shared facts 10, only V2 0, only V1 0, changed 0, divergent events 0 / 2 |
| V2: conceal the log, collect the dispatch slip | V2 state v26, 15 facts, 26 events, hash `c3c4cc3832116a11`; V1 still v16 / `33c1546cdf333f34` |
| Compare after divergence | shared facts 8, only V2 5 (`evidence.ward_dispatch`, `npc.sable.stance`, `story.relay_choice`, `story.relay_choice_resolved`, `world.ward_alert`), changed 2 (`story.phase`, `world.dispatch_continuity`), decision `node.sable.relay: conceal \| undecided`, divergent events 12 / 2 |
| Switch to V1 | toast `Timeline switched. Canonical hash 33c1546cdf333f34.`; caption `V1 · STATE v16 · 33c1546cdf333f34`, exactly the hash V1 had when it was left |
| Ledger on V2 before the switch | lineage `V1 (root, v16, 33c1546cdf333f34) → V2 (v26, c3c4cc3832116a11, forked at anc_0fdb10_000u, checkpoint v14, event 15)` |

Mobile, 390 x 844:

| Step | Observed |
|---|---|
| Fork | V1 `2ec2136fa80f9f59` before the fork, then v16 `ce79aa960205c485` after the `branch.forked` event; checkpoint `f854bad7a854bdb6` at v14 / event 15; V2 v14 `ac2ce532e0385549` |
| Diverged V2 after conceal | V2 v23 `f1d056b7fe2990f4`; comparison shared 9, only V2 4 (`npc.sable.stance`, `story.relay_choice`, `story.relay_choice_resolved`, `world.ward_alert`), changed 1, divergent events 9 / 2, decision `conceal \| undecided` |

Console: 0 errors and 0 warnings in every run. The earlier Stage 6 script runs
also reported 0 errors.

### Screenshots

| File | Shows |
|---|---|
| `docs/stage6_01_start.png` | V1 street with the live timeline chip |
| `docs/stage6_02_anchor.png` | anchor recorded after reading Relay 7; checkpoint details in field notes |
| `docs/stage6_03_blink_anchor.png` | BLINK panel before forking: one timeline, one anchor |
| `docs/stage6_04_blink_forked.png` | after BLINK: V2 active at the checkpoint, V1 preserved |
| `docs/stage6_04b_comparison_at_fork.png` | comparison at the fork point: zero divergence |
| `docs/stage6_05_v2_diverged.png` | V2 consequence after concealing the log |
| `docs/stage6_06_blink_comparison.png` | comparison after divergence, canonical facts and decisions |
| `docs/stage6_07_blink_switched_v1.png` | switch back to V1 with the restored hash |
| `docs/stage6_08_v1_restored.png` | V1 street after the switch: no V2 decisions present |
| `docs/stage6_09_ledger_lineage.png` | ledger lineage chain with fork coordinates and branch tags |
| `docs/stage6_10_blink_narrow.png` | BLINK panel at 390 px before forking |
| `docs/stage6_11_blink_narrow_forked.png` | forked panel at 390 px |
| `docs/stage6_12_blink_narrow_comparison.png` | mobile comparison at the fork point |
| `docs/stage6_13_blink_narrow_diverged.png` | mobile comparison after concealing |

## 6. Files added or changed

Added:

- `src/engine/session/branching.ts`
- `src/ui/BlinkPanel.tsx`
- `tests/stage6Branching.test.ts`
- `docs/STAGE_6_PLAN.md`, `docs/STAGE_6_REPORT.md`
- `docs/adr/0013-branch-lifecycle-and-fork-point.md`
- `docs/adr/0014-scar-carry-allowlist.md`
- `docs/stage6_*.png` (14 screenshots)

Changed:

- `src/engine/contracts/branch.ts`, `src/engine/contracts/fixtures.ts`
- `src/engine/core/reducer.ts`, `src/engine/core/validation.ts`
- `src/engine/session/gameSession.ts`, `src/engine/index.ts`
- `src/App.tsx`, `src/styles.css`, `src/world/worldView.ts`
- `src/ui/Ledger.tsx`, `src/ui/FieldNotes.tsx`, `src/game/DistrictScene.ts`
- `tests/eventRoundTrip.test.ts`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/EVENT_MODEL.md`,
  `docs/CONTRACT_CATALOGUE.md`, `docs/CAUSAL_MODEL.md`,
  `docs/IMPLEMENTATION_CHECKLIST.md`

## 7. Limitations and open risks

1. **Branch state is in memory.** A restored session reconstructs only the active
   branch. Switching to a known-but-not-materialised branch returns
   `stale_snapshot` rather than a partial restore. The test asserts this
   behaviour, and the UI reports it, but it is not equivalent to restoring every
   branch.
2. **Memory grows with branches and versions.** Each branch keeps its per-version
   state history. Fine for one in-memory session; a real persistence design must
   choose snapshotting or log replay.
3. **Inherited entities are re-scoped.** A fact that existed before the fork
   carries the child's `branchId` in the child state, so a straight comparison of
   raw entity fields across branches would show a difference that the comparison
   correctly ignores (it compares keys and values). Shared ancestry is preserved
   through `sourceEventId`.
4. **A fork is not free of state changes.** Carrying scars adds one event and one
   state version per scar to the child, so the child starts at
   `anchor.stateVersion + scars`. The panel shows this; it is documented in
   ADR 0014.
5. **Comparison is a flat diff.** It lists fact keys, changed values, per-node
   decisions, endings, event overlap and scars. It does not attempt a causal
   explanation of why a value differs.
6. **Comparison base is the active timeline.** The panel compares the active
   timeline against the selected one; comparing two inactive timelines would need
   a richer selection UI.
7. **FNV-1a is a checksum, not a signature.** Branch hashes detect drift and make
   switching verifiable, but they do not resist a deliberate forger (ADR 0005).
8. **No scar producer in content yet.** The scar channel is implemented and
   tested through `fact.assert`, but Stage 5 content does not yet assert a scar,
   so a normal play-through shows `scars: none | none`. Adding story scars is
   content work, not engine work.
9. **Phaser bundle size unchanged.** ~1.37 MB (357 kB gzip). Stage 6 adds no
   bundle-splitting.
10. **Mobile touch and audio verified in layout, not on hardware.** BLINK is
    reachable and usable at 390 px, and the new clips load, but mix balance and
    multi-touch were not measured on a physical device.
11. **CDP harness is not committed.** Play-through scripts live in the temp
    workspace; the screenshots and the commands above are the durable evidence.
12. **Branch status is not archived.** `status` stays `active` for every fork; no
    flow archives a timeline yet.

## 8. Gate request

Requesting Stage 6 sign-off on the basis of:

- the 10-test Stage 6 acceptance suite and 108/108 tests across 13 files;
- a clean typecheck and production build;
- remote CI green on the Stage 6 commit (run `41204915349`, both jobs success);
- the desktop and mobile play-through with verified V1 restoration and canonical
  comparison, at 0 console errors;
- the branch-isolation evidence in §3 and §5;
- ADR 0013 (fork lifecycle and switching) and ADR 0014 (scar allowlist).

Stage 6 implementation commit: `a1c9209` (remote CI run `41204915349`, green).
This report's commit hash is recorded by the follow-up documentation commit. No
Stage 7 work - ECHO, MORROW policy, persistence, NPC cognition or LLM memory -
will begin until this gate is accepted.
