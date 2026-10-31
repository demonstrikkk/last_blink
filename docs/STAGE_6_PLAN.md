# Stage 6 Plan - Real Timeline Branching

Status: delivered. See `docs/STAGE_6_REPORT.md` for acceptance evidence.
Baseline: Stage 5 signed off at `26b1b9d` / `8b03a48`; remote CI green on
`6ecf9d8` (run 41201157399) and `88a167f` (run 41201289746), 98/98 tests.

## 1. Objective

Make BLINK a real second timeline rather than a rewind. A fork must produce a
second canonical state, the original must stay byte-identical, switching must be
reversible in both directions, ancestry must be explicit, and comparison must be
derived from canonical data. No LLM, no MORROW policy, no database, no
visual-only effect.

The acceptance bar is behavioural: after recording an anchor in V1, forking,
diverging in V2 and switching back, V1's state hash must equal the hash it had at
the moment it was left.

## 2. Fork contract

A fork is anchored, never "now". The `Branch` contract gains:

| Field | Meaning |
|---|---|
| `forkedAtAnchorId` | anchor the child starts from (existing) |
| `forkedAtStateVersion` | checkpoint state version (clarified meaning) |
| `forkedAtTick` | checkpoint tick (clarified meaning) |
| `forkedAtEventSequenceNo` | position of `anchor.recorded` in the parent log |
| `forkedAtStateHash` | parent canonical hash at the checkpoint |

The reducer validates every one of these against the anchor already in state, so
a fork whose metadata does not describe that checkpoint is rejected with
`anchor_hash_mismatch` / `stale_anchor` before anything is written.

The child state is materialised from the parent's retained per-version history at
`anchor.stateVersion` and re-scoped to the child branch. Post-checkpoint facts,
choices, anchors and events are excluded by construction.

## 3. Session surface

`GameSession` gains, without changing existing methods:

| Method | Purpose |
|---|---|
| `forkTimeline(anchorId, label)` | fork and return `{ result, branchId }`; does not activate |
| `switchBranch(branchId)` | move the active pointer; returns `BranchSwitchResult` |
| `listBranches()` | `BranchSummary[]` with hash, counts, ending, checkpoint |
| `getBranchState(branchId)` / `getBranchHash(branchId)` | read another timeline |
| `getActiveBranchId()` | current timeline |
| `compareBranches(baseId, otherId)` | canonical comparison |
| `getLineageEvents(branchId)` | ancestry up to the fork point, then own events |

`switchBranch` writes no event: history must not depend on where the player
looked. Its failure codes are `unknown_branch`, `already_active`,
`stale_snapshot` and `hash_mismatch`, and a rejected switch leaves the active
snapshot object untouched.

## 4. Scar rule

Only `scar.*` facts cross a fork, and only those asserted after the checkpoint.
Each becomes an explicit `fact.asserted` event on the child with
`source.ref: 'scar.carry:<key>'`. Nothing else crosses. Full reasoning: ADR 0014.

## 5. UI

| Surface | Change |
|---|---|
| Topbar | V*N*/*total* chip is a button; new `BLINK` button |
| BLINK panel | timeline cards (state, tick, facts, events, ending, hash, checkpoint), anchors with fork action, comparison section |
| Field notes | timeline block, anchor ID/version/event and "forked into" |
| Ledger | timeline lineage chain and per-event branch tags; lineage events, not just recent |
| World caption | active timeline index in the caption |
| Scene | `blink` and `timeline-shift` clips load and play on fork/switch |

All numbers in the panel come from engine projections; the panel keeps no story
state of its own.

## 6. Implementation steps

1. Extend `branchSchema` with the fork-point fields and refine root/child rules.
2. Rewrite the `branch.forked` reducer case to validate against the anchor.
3. Add pure `session/branching.ts`: ancestry, re-scope, scar collection, lineage,
   summaries, comparison.
4. Add per-branch runtimes to `GameSession`; materialise child state; inject
   scars; add switch/compare/list APIs.
5. Widen `fact.assert` validation to `scar.*` in addition to `debug.*`.
6. Add `tests/stage6Branching.test.ts` (10 acceptance tests); update fixtures.
7. Add `BlinkPanel`, wire App, Ledger, FieldNotes, worldView, scene SFX, styles.
8. Build, drive fork/switch/compare in headless Chrome at 1440x900 and 390x844,
   capture screenshots, write docs and report, run the quality gate, push.

## 7. Acceptance tests

- Fork from an anchor creates a child with exact checkpoint facts.
- V1 is unchanged apart from the `branch.forked` ancestry event.
- Switch V1 -> V2 -> V1 restores both hashes exactly.
- Divergence after the fork is visible in canonical comparison.
- Ancestry stops at the fork point; child events are its own.
- Only scars cross; other post-checkpoint facts do not.
- Invalid anchor, repeated fork, stale snapshot and failed switch mutate nothing.
- Stage 3, 4 and 5 tests stay green.
- The full BLINK experience works in the browser at desktop and mobile widths.

## 8. Out of scope

YugabyteDB, Meko, LLM memory or dialogue, ECHO retrieval, PPO or MORROW adaptive
policy, persistent per-branch save files, and any visual-only rewind.
