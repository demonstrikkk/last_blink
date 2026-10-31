# ADR 0005 — FNV-1a over canonical JSON for deterministic hashes

- Status: accepted
- Date: 2026-10-31
- Owners: engine

## Context

Anchors, snapshots and saves need stable identity. `node:crypto` is not available
in the browser without a shim and would make the engine platform-dependent.
`JSON.stringify` preserves insertion order, so it is not a canonical encoding.
Cryptographic strength is not required for replay comparison or accidental
corruption detection.

## Decision

- `canonicalJson` sorts object keys recursively, normalises `-0` and rejects any
  non-JSON value.
- `fnv1a64` hashes UTF-8 bytes and returns 16 lowercase hex characters.
- State, anchors and save checksums use this hash.
- The hash is documented as a determinism and integrity check, not a signature.

## Consequences

- The same code runs in browser, Node tests and any future worker.
- No dependency and no async crypto API.
- FNV-1a is not collision-resistant against a motivated attacker. Saves are local
  game data, not security credentials. If saves ever gate competitive or paid
  content, add an HMAC on the server; do not pretend the current checksum is one.
- Changing the hash function or canonicalisation requires a save-format version
  bump and a migration, because every stored hash changes.
