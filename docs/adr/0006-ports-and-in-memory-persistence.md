# ADR 0006 — Ports at every edge; in-memory persistence first

- Status: accepted
- Date: 2026-10-31
- Owners: persistence, platform

## Context

Stage 3 must prove the foundation without a live LLM, YugabyteDB cluster or Meko
connection. At the same time, later stages must not require rewriting the engine
to add those systems.

## Decision

Define narrow ports:

- `ClockPort` — injected time;
- `GamePolicyPort` — allow/deny proposals;
- `PersistencePort` — save, load, list envelopes;
- `ContentPort` — load validated content;
- `LoggerPort` — structured diagnostics.

Stage 3 ships deterministic mocks: `FixedClock`, `InMemoryPersistence`,
`StaticContentPort`, `InMemoryLogger`, `allowAllPolicy` and `createPrefixPolicy`.
The browser composition root selects them. Tests select their own.

No IndexedDB, HTTP, SQL or MCP code is written yet. The ports are the contract;
adapters arrive after deterministic gameplay and the event model are stable.

## Consequences

- Tests are fast, deterministic and offline.
- Swapping in IndexedDB or YSQL does not touch the reducer or contracts.
- Save data is lost on refresh in Stage 3; the UI states this explicitly.
- Ports must stay small. A port that mirrors a vendor API would leak the vendor
  into the architecture and defeat the purpose.
- Persistence failures surface through `save()` rejection; the engine state stays
  usable.
