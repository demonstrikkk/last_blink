# Stage 8 Plan - ECHO Branch-Aware Retrieval

Status: implemented with Stage 7; awaiting combined Stage 7-8 gate.
Date: 2026-10-31

## Objective

Add a read-only explanation service that answers only from canonical records in
one branch, cites every substantive claim and treats "unknown" as a valid answer.

## Scope

- `EchoService(session, content)`.
- Typed queries: situation, fact, decision, morrow, ending, compare.
- Claim kinds: recorded_fact, recorded_event, derived_conclusion, inference,
  unavailable.
- Status: grounded, partial, unknown.
- Citations by fact, event, choice, anchor, branch, rule or ending id.
- Branch isolation via `getBranchState` + `getLineageEvents`; comparison only via
  `compareBranches`.
- UI: ECHO panel with typed query controls and citation list.

## Acceptance tests

1. Unknown fact -> `unknown`; no value is invented.
2. Known fact -> fact and source-event citations.
3. Decision before it happens -> `partial`, no recorded-event claim.
4. Committed decision -> choice/event citations and consequence facts.
5. MORROW explanation cites accepted/rejected proposal records.
6. Child query cannot see a parent's post-fork evidence.
7. Comparison is explicit and cites both branches.
8. Ending explanation cites ending event, definition and rule.
9. Ending before it exists -> `unknown`.
10. Situation is scoped and cites the branch summary.

## Out of scope

LLM answers, embeddings/vector retrieval, write-back, free-text NLP and
cross-branch retrieval without an explicit compare query.
