# ADR 0001 — The deterministic engine is the only authority

- Status: accepted
- Date: 2026-10-31
- Owners: engine, ai-runtime

## Context

The game has several systems that could plausibly own state: Phaser scenes, React
UI, a future LLM NPC runtime, a persistence layer and Meko-managed context. If
more than one can change facts, the demo cannot explain why the world changed and
replay becomes impossible.

## Decision

`GameSession` and `reduceGameState` are the only path to canonical state. Phaser
renders snapshots, React frames them, agents submit proposals, persistence stores
envelopes. None of those may write facts, ticks, choices, anchors, branches or
endings directly. AI output is untrusted input and is validated exactly like
player input.

## Consequences

- Every outcome is attributable to a validated event.
- A renderer or model failure cannot corrupt the world.
- Agents need a proposal → validation → `ActionResult` round trip, which costs
  latency but preserves auditability.
- Any future shortcut that writes state outside the reducer is an architectural
  defect, not an optimisation.
