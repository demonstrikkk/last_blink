# ADR 0007 — No client state library; `useSyncExternalStore`

- Status: accepted
- Date: 2026-10-31
- Owners: platform

## Context

The UI needs to render the latest engine snapshot and re-render on commits.
Adding Zustand/Redux would create a second state container and invite derived game
logic into the client. The engine already exposes immutable snapshots and a
subscription.

## Decision

Use React's `useSyncExternalStore` directly with `GameSession.subscribe` and
`GameSession.getSnapshot`. No state library, no duplicated store, no optimistic
game state. Components read the snapshot; actions go back through `dispatch`.

## Consequences

- One state authority, no synchronisation bugs between stores.
- Zero extra dependency and a smaller bundle.
- The snapshot object must be referentially stable between commits; the session
  replaces it only in `commit`, so this holds.
- Derived UI values (sorted facts, latest anchor, event slice) are computed during
  render; Stage 3 volumes are tiny. Memoise only if profiling shows a problem.
- Once the world scene needs per-frame interpolation, Phaser can keep transient
  visual state while still treating the engine snapshot as authoritative.
