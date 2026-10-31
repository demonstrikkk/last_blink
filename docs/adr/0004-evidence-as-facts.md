# ADR 0004 — Evidence is a fact namespace, not a sixteenth contract

- Status: accepted
- Date: 2026-10-31
- Owners: narrative, engine

## Context

The design brief treats evidence as a first-class concept, but the Stage 3
contract list is explicit about fifteen shared objects. Evidence and ordinary
world facts have the same needs: a namespaced key, a JSON value, provenance, a
branch and a tick. A separate Evidence schema would duplicate Fact and create two
ways to represent the same truth.

## Decision

Evidence is stored as facts under the `evidence.*` key namespace. The fact's
`source` records whether it came from an asset, an in-world record, testimony,
rule derivation or the system. The player's `progress.evidenceFound` counter
increments once when a new `evidence.*` key is asserted.

UI language, verification state, contradiction handling and ECHO citations are
presentation concerns layered over these facts. They do not need a separate
persistence shape.

## Consequences

- One provenance model, one reducer path and one validation rule.
- A future evidence view queries `facts` by prefix; it does not join a second
  table.
- Verification and contradiction are derived views, not stored duplicates. If
  later requirements demand an audit of *who verified what and when*, that will
  be a new event and possibly a new contract, introduced deliberately.
- The `evidence.` prefix is a convention enforced by code that counts evidence,
  not by the Fact schema. Content review must keep the prefix honest.
