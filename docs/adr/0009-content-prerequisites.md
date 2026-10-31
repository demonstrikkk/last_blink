# ADR 0009 — Content prerequisites and causal metadata without a contract bump

- Status: accepted
- Date: 2026-10-31
- Owners: engine, narrative
- Supersedes: none
- Related: ADR 0001 (engine authority), ADR 0004 (evidence as facts), ADR 0008
  (additive action vocabulary)

## Context

Stage 4 shipped one evidence item and one choice. Its narrative gate was soft:
Sable's conversation and decision were available before the player had read the
Relay 7 terminal, because Sable narrated the relay's contents herself. The Stage
4 report recorded that as a known limitation.

Stage 5 needs three things Stage 4 did not have:

1. an evidence chain, where later evidence is only meaningful after earlier
   evidence exists;
2. decisions that must be evidence-informed, enforced by the engine rather than
   by hiding a button;
3. presentation metadata for story objectives and endings, which are engine
   concepts but were previously hard-coded strings in the UI.

Doing this by changing the frozen contracts would force a `CONTRACT_VERSION`
bump, invalidate every fixture and save, and contradict the Stage 3 guarantee
that contracts are stable across stages. Doing it in React would create a second
source of truth for gating.

## Decision

Extend `GameContent` — trusted, versioned story data validated by
`gameContentSchema` — and never the frozen event or state contracts.

Additive content changes:

- `evidenceDefinitionSchema` gains `sourceKind: 'record' | 'testimony' | 'asset'`
  (default `record`) and `requires: factKey[]` (default `[]`).
- `choiceNodeSchema` gains `requires: factKey[]` (default `[]`).
- `gameContentSchema` gains `objectives` (`objectiveId`, `label`, `detail`,
  `requires[]`) and `endings` (`endingId`, `title`, `summary`). Both are
  presentation metadata for engine-owned concepts.

Enforcement:

- `validateAction` rejects an `evidence.collect` or `choice.make` whose declared
  prerequisites are absent, with the existing frozen rejection code
  `invalid_action` and `details.missing` listing the missing fact keys.
- The duplicate guard still runs first, so a repeated decision reports
  `duplicate`.
- `EventSession`'s evidence path uses the definition's `sourceKind` instead of a
  hard-coded `record`, so testimony is attributed honestly.

Deliberate constraints:

- No new event type, rejection code, action type or state field.
- The new content fields have Zod defaults, so a Stage 4 content bundle still
  parses unchanged.
- `CONTRACT_VERSION` stays `1.0.0`; the fifteen frozen contracts are untouched.
- Story progress stays in facts (`story.phase`, `story.*_resolved`), not in a
  session field, so gating is replayable and hash-covered.
- Delayed consequences are milestone-triggered rules over facts, not timers. The
  engine still has no wall-clock or random trigger.

## Consequences

- Content is now the place where narrative structure is declared: chains,
  gates, objectives and ending presentation. A designer can add a gate without
  touching TypeScript control flow.
- The engine remains authoritative: the UI can show a locked decision, but a
  hand-crafted action is refused by the same rule.
- Rejection payloads are richer (`details.missing`) while the frozen rejection
  contract is unchanged, because `details` was already a JSON object.
- Adding a fact key to a `requires` list is cheap; adding a new *kind* of
  prerequisite (e.g. "any of", tick windows, relationship thresholds) would need
  a new ADR, because `requires` is currently a flat conjunction.
- The alternative — a dedicated `gate` contract — was rejected: it would add a
  fifteenth-plus contract, a version bump and migration work for a feature that
  is entirely content-driven.
- The alternative — UI-only gating — was rejected: it would let the renderer
  decide what the story allows, violating ADR 0001.

## Follow-ups

- If prerequisites ever need disjunction or numeric thresholds, replace
  `requires: factKey[]` with a condition tree and bump the content schema.
- Objective completion is derived by the projection, not stored. If objectives
  ever become canonical (for scoring or ECHO), they need a fact namespace and an
  event, not a UI change.
