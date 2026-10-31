# ADR 0013 - Branch lifecycle: fork from a checkpoint, switch by pointer

- Status: accepted
- Date: 2026-10-31
- Owners: engine
- Supersedes: none
- Related: ADR 0001 (engine authority), ADR 0005 (FNV canonical hash),
  ADR 0006 (ports and in-memory persistence), ADR 0014 (scar memory)

## Context

Stage 3 added the `Branch` contract and the `branch.forked` event, but a fork was
only a lineage record: it did not create a playable second timeline, and there
was no way to switch between timelines. The `branchSchema` also described the
fork point as "current state version and tick", which is ambiguous once the
player blinks back to an anchor they recorded several events earlier.

Stage 6 is *real* timeline branching. A fork must produce a genuinely separate
canonical state, the original must be untouched, switching must be reversible,
and comparison must be derived from canonical data. A visual rewind over one
state is explicitly not acceptable.

Three design questions had to be answered:

1. **Where does a child timeline start?** At the anchor checkpoint, or at the
   parent's live state?
2. **Does forking activate the child?** Changing activation changes the meaning
   of the existing `forkBranch` API and could break Stage 3-5 behaviour.
3. **Is a switch an event?** Writing a switch into the log would make the log
   depend on UI navigation and would rewrite state for a pointer move.

## Decision

### A fork starts at the anchor checkpoint

`Branch` gains two additive, nullable fields:

- `forkedAtEventSequenceNo` - the position of the `anchor.recorded` event in the
  parent's log;
- `forkedAtStateHash` - the parent's canonical state hash at the checkpoint.

`forkedAtStateVersion` and `forkedAtTick` keep their names but now mean "the
checkpoint the child starts from", not "the parent's live version". This is a
semantic clarification of nullable fields on a contract that Stage 3-5 never
populated for a real child, not a payload rewrite.

The reducer validates all five checkpoint fields against the anchor it already
holds. A fork whose metadata disagrees with the anchor, or whose anchor is
missing, unsafe or in the future, is rejected before any state is written.

### The child state is materialised from retained history

`GameSession` keeps, per branch, a runtime `{ state, hash, history, events }`.
The child state is the parent's retained state at `anchor.stateVersion`, then
re-scoped onto the child branch. Inherited facts, choices and anchors keep their
IDs, provenance and `sourceEventId`; only `branchId` changes, because
`gameStateSchema` requires state-level entities to belong to the state's branch.
Shared ancestry remains visible through `sourceEventId` and through the lineage
event log.

Anything the parent did after the checkpoint is excluded by construction: the
child is built from `history[stateVersion]`, not from the parent's live state.

### Forking does not activate the child

`forkTimeline` creates the branch, writes exactly one parent event
(`branch.forked`), and leaves the parent active. `forkBranch` keeps its Stage 3
meaning. Activating the child is a separate `switchBranch` call, which the UI
performs immediately after a player-initiated blink.

Rationale: activation is navigation, not world change. Keeping them separate
preserves every Stage 3-5 test, keeps the event log honest, and lets a caller
inspect or compare a fork before entering it.

### Switching is a session operation, not an event

`switchBranch(branchId)` moves the active pointer to a retained runtime after
re-verifying that the stored hash still matches `hashCanonical(state)`. It writes
no event to either timeline, so no timeline's history depends on where the player
looked. Failures return a discriminated result and leave the active snapshot
untouched:

| Code | Meaning |
|---|---|
| `unknown_branch` | no branch with that ID exists in this session |
| `already_active` | the requested branch is already active |
| `stale_snapshot` | the branch is known but its state is not retained here |
| `hash_mismatch` | retained state no longer hashes to its recorded hash |

Returning a result rather than throwing keeps a rejected switch a normal,
auditable outcome, consistent with `ActionResult`.

### Ancestry and lineage are explicit

`getLineageEvents(branchId)` walks the ancestry chain from the root and emits
each ancestor's events only up to the checkpoint at which the child forked,
followed by the active branch's own events. Ancestor events are never replayed
into the child; they are reported as shared history. `listBranches()` exposes a
`BranchSummary` per timeline with state version, hash, counts, ending and
checkpoint, and `compareBranches(base, other)` derives the comparison from the two
canonical states plus their lineage logs - never from a UI-maintained copy.

### Deliberate limitation

Runtimes are in memory. `restore()` reconstructs only the active branch, so
switching to a branch that exists in the restored state returns
`stale_snapshot` instead of pretending to restore it. Persisting every branch is
deferred until persistence stops being in-memory (ADR 0006).

## Consequences

- The frozen event payloads are unchanged; `branch.forked` still carries
  `{ branch, fromAnchorId }`. Only nullable `Branch` fields gained values and two
  new nullable fields were added, so `CONTRACT_VERSION` stays `1.0.0` and old
  fixtures still parse.
- A fork is reproducible: given the same parent history and anchor, the child
  state is the same state, with the same hash, on every run.
- Comparison cannot drift from the engine because it reads the same states the
  engine keeps.
- Memory grows with the number of branches and state versions per session. That
  is acceptable for a single-player in-memory session and is recorded as a limit,
  not hidden.
- A future persistent save must either store per-branch snapshots or replay each
  branch log from the root; that decision belongs to the persistence ADR when
  persistence stops being in-memory.
