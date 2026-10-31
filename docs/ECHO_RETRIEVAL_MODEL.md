# ECHO Retrieval Model - Stage 8

ECHO explains what canonical records support. It is a read-only service over one
branch, not a summariser and not a second story model.

## Scope rule

Every single-branch query resolves its scope with:

```ts
const state  = session.getBranchState(branchId ?? session.getActiveBranchId());
const events = session.getLineageEvents(branchId ?? session.getActiveBranchId());
```

`getLineageEvents` already stops ancestor events at the fork point (Stage 6), so
a child query cannot see the parent's post-fork discoveries. The only query that
touches two timelines is `compare`, which calls `session.compareBranches` and
cites both branch summaries.

## Queries

| Query | Answers from |
|---|---|
| `situation` | branch summary, phase fact, all `evidence.*` facts, MORROW posture fact, ending fact/event |
| `fact(key)` | the canonical fact, its `sourceEventId`, the fact assertion history and the deriving rule when `source.kind = derived` |
| `decision(nodeId)` | content node, committed `Choice`, `choice.made` event, the selected option and its consequence facts |
| `morrow` | `morrow.proposal.evaluated` records (accepted and rejected) and `morrow.intervened` records, plus the recorded posture fact |
| `ending` | `ending.reached` event, ending definition, asserting fact keys and the rule(s) that can commit it |
| `compare(base, other)` | `BranchComparison`: fork point, changed/only facts, divergent choices, endings, event overlap, anchors |

## Answer shape

```ts
interface EchoAnswer {
  query: EchoQuery;
  status: 'grounded' | 'partial' | 'unknown';
  summary: string;
  claims: EchoClaim[];
  missing: string[];
  branchId: string | null;
  branchLabel: string | null;
}
```

Each claim has one of five kinds:

| Kind | Meaning |
|---|---|
| `recorded_fact` | a fact currently present in branch state |
| `recorded_event` | an event present in the branch lineage |
| `derived_conclusion` | a conclusion computed from cited records (rule, comparison, history count) |
| `inference` | an expectation such as "a consequence key is not recorded yet"; still cited |
| `unavailable` | a scope or record that does not exist; the only claim kind allowed to be uncited |

Citations use `fact`, `event`, `choice`, `anchor`, `branch`, `rule` or `ending`
ids, and carry branch id and event sequence where applicable.

## Status semantics

- `grounded`: every requested element was found in canonical records.
- `partial`: some elements exist, but a source event or another requested piece
  is missing from the lineage.
- `unknown`: the question cannot be answered from this scope. Unknown is an
  expected result and carries `missing` keys.

ECHO must not promote an inference to a recorded fact. It also does not guess a
fact value, an option label or an ending before they exist in state.

## Determinism

Answers are a pure function of the session's branch state, lineage events and the
static content bundle. ECHO reads no clock, environment, randomness or network.

## Limits

- The service answers typed queries; it is not a free-text natural-language
  interface. The UI exposes the typed query shapes.
- It does not use an LLM or embeddings. Retrieval is direct canonical lookup.
- It explains only the registered content bundle; an unknown node or fact key
  returns `unknown` rather than a plausible fabrication.
- It cannot explain a branch that the session has not materialised; the answer is
  `unknown`.
