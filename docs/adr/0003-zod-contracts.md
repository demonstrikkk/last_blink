# ADR 0003 — Zod is the single source of contract truth

- Status: accepted
- Date: 2026-10-31
- Owners: engine, platform

## Context

Hand-written TypeScript interfaces disappear at runtime. Event payloads, saves,
model proposals and future database records cross trust boundaries, so shape
errors must fail loudly at the boundary rather than surface as undefined values
deep in the reducer.

## Decision

Each contract is defined once as a Zod schema. TypeScript types are inferred with
`z.infer`, never duplicated by hand. Every contract has:

- a strict object schema (unknown keys fail);
- a literal `schemaVersion`;
- an entry in `CONTRACT_REGISTRY` with owner and summary;
- one valid and one invalid fixture;
- a test proving both outcomes.

Boundaries parse: actions, events before reduction, saves before restore,
content before session creation and results before return. The reducer trusts its
validated input but still enforces cross-object invariants.

## Consequences

- There is one place to change a contract, and it is executable.
- `zod` (4.6.7) is the only runtime validation dependency.
- Strict object parsing rejects accidental extra fields, which means additive
  changes must be deliberate and versioned.
- Validation runs on every dispatch and save; Stage 3 volumes are small. If
  profiling later proves it hot, parsing can be cached by content version without
  changing the contract.
