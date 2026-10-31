import {
  type Anchor,
  type BranchId,
  type Choice,
  type Fact,
  type GameEvent,
  type GameState,
} from '../contracts/index.js';
import type { GameContent } from '../content/stage3Content.js';
import type { GameSession } from '../session/gameSession.js';
import type { BranchSummary } from '../session/branching.js';

export type EchoClaimKind =
  | 'recorded_fact'
  | 'recorded_event'
  | 'derived_conclusion'
  | 'inference'
  | 'unavailable';

export type EchoCitationKind =
  | 'fact'
  | 'event'
  | 'choice'
  | 'anchor'
  | 'branch'
  | 'rule'
  | 'ending';

export interface EchoCitation {
  readonly kind: EchoCitationKind;
  readonly id: string;
  readonly label: string;
  readonly branchId: string | null;
  readonly sequenceNo: number | null;
}

export interface EchoClaim {
  readonly kind: EchoClaimKind;
  readonly text: string;
  readonly citations: readonly EchoCitation[];
}

export interface EchoAnswer {
  readonly query: EchoQuery;
  readonly status: 'grounded' | 'partial' | 'unknown';
  readonly summary: string;
  readonly claims: readonly EchoClaim[];
  readonly missing: readonly string[];
  readonly branchId: string | null;
  readonly branchLabel: string | null;
}

export type EchoQuery =
  | { readonly kind: 'situation'; readonly branchId?: BranchId }
  | { readonly kind: 'fact'; readonly key: string; readonly branchId?: BranchId }
  | { readonly kind: 'decision'; readonly nodeId: string; readonly branchId?: BranchId }
  | { readonly kind: 'morrow'; readonly branchId?: BranchId }
  | { readonly kind: 'ending'; readonly branchId?: BranchId }
  | {
      readonly kind: 'compare';
      readonly baseBranchId: BranchId;
      readonly otherBranchId: BranchId;
    };

interface Scope {
  readonly branchId: BranchId;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly summary: BranchSummary | null;
}

function factCitation(fact: Fact): EchoCitation {
  return {
    kind: 'fact',
    id: fact.factId,
    label: fact.key,
    branchId: String(fact.branchId),
    sequenceNo: null,
  };
}

function eventCitation(event: GameEvent, label: string): EchoCitation {
  return {
    kind: 'event',
    id: event.eventId,
    label: `${label} · ${event.type}`,
    branchId: String(event.branchId),
    sequenceNo: event.sequenceNo,
  };
}

function branchCitation(branch: BranchSummary): EchoCitation {
  return {
    kind: 'branch',
    id: String(branch.branchId),
    label: `V${branch.timelineIndex + 1} ${branch.label}`,
    branchId: String(branch.branchId),
    sequenceNo: null,
  };
}

function choiceCitation(choice: Choice): EchoCitation {
  return {
    kind: 'choice',
    id: String(choice.choiceId),
    label: choice.nodeId,
    branchId: String(choice.branchId),
    sequenceNo: null,
  };
}

function anchorCitations(state: GameState): EchoCitation[] {
  return state.anchors.map((anchor: Anchor) => ({
    kind: 'anchor' as const,
    id: String(anchor.anchorId),
    label: anchor.label,
    branchId: String(anchor.branchId),
    sequenceNo: anchor.eventSequenceNo,
  }));
}

function label(config: { readonly title: string }): string {
  return config.title;
}

/**
 * Stage 8 ECHO: read-only, branch-scoped retrieval and explanation.
 *
 * Every query calls `getBranchState` and `getLineageEvents` for one branch. The
 * only way to look at two timelines is the explicit compare query, which goes
 * through GameSession.compareBranches. There is no code path that reads another
 * branch's post-fork events during a single-branch query.
 */
export class EchoService {
  constructor(
    private readonly session: GameSession,
    private readonly content: GameContent,
  ) {}

  ask(query: EchoQuery): EchoAnswer {
    switch (query.kind) {
      case 'situation':
        return this.explainSituation(query);
      case 'fact':
        return this.explainFact(query.key, query.branchId);
      case 'decision':
        return this.explainDecision(query.nodeId, query.branchId);
      case 'morrow':
        return this.explainMorrow(query.branchId);
      case 'ending':
        return this.explainEnding(query.branchId);
      case 'compare':
        return this.explainComparison(query.baseBranchId, query.otherBranchId);
      default: {
        const exhaustive: never = query;
        return this.unknown(exhaustive, 'I do not know how to answer that.', []);
      }
    }
  }

  explainSituation(query: { readonly kind: 'situation'; readonly branchId?: BranchId }): EchoAnswer {
    const scope = this.scope(query.branchId);
    if (!scope) return this.unknown(query, 'That timeline is not retained in this session.', []);

    const claims: EchoClaim[] = [
      {
        kind: 'recorded_fact',
        text: `The active scope is ${this.branchLabel(scope)} at state version ${scope.state.stateVersion}, tick ${scope.state.tick}.`,
        citations: scope.summary ? [branchCitation(scope.summary)] : [],
      },
    ];

    const phase = scope.state.facts['story.phase'];
    if (phase) {
      claims.push({
        kind: 'recorded_fact',
        text: `The investigation phase is recorded as ${JSON.stringify(phase.value)}.`,
        citations: [factCitation(phase)],
      });
    }

    const evidence = Object.values(scope.state.facts)
      .filter((fact) => fact.key.startsWith('evidence.'))
      .sort((left, right) => (left.key < right.key ? -1 : 1));
    for (const fact of evidence) {
      claims.push({
        kind: 'recorded_fact',
        text: `${fact.key} is on the record: ${JSON.stringify(fact.value)}.`,
        citations: [factCitation(fact)],
      });
    }
    if (evidence.length === 0) {
      claims.push({
        kind: 'unavailable',
        text: 'No evidence fact has been recorded on this branch yet.',
        citations: [],
      });
    }

    const response = scope.state.facts['morrow.response'];
    if (response) {
      claims.push({
        kind: 'recorded_fact',
        text: `MORROW's last recorded posture is ${JSON.stringify(response.value)}.`,
        citations: [factCitation(response)],
      });
    }

    if (scope.state.endingId !== null) {
      const endingEvent = [...scope.events]
        .reverse()
        .find((event) => event.type === 'ending.reached');
      claims.push({
        kind: 'recorded_event',
        text: `This branch reached ${scope.state.endingId}.`,
        citations: endingEvent ? [eventCitation(endingEvent, 'Ending committed')] : [],
      });
    }

    return this.answer(query, scope, 'grounded', this.situationSummary(scope), claims, []);
  }

  explainFact(key: string, branchId?: BranchId): EchoAnswer {
    const query: EchoQuery = { kind: 'fact', key, branchId };
    const scope = this.scope(branchId);
    if (!scope) return this.unknown(query, 'That timeline is not retained in this session.', [key]);

    const fact = scope.state.facts[key];
    if (!fact) {
      return this.answer(
        query,
        scope,
        'unknown',
        `I cannot establish ${key}. No canonical fact with that key exists on ${this.branchLabel(scope)}.`,
        [
          {
            kind: 'unavailable',
            text: `There is no recorded fact for ${key} in this branch scope.`,
            citations: scope.summary ? [branchCitation(scope.summary)] : [],
          },
        ],
        [key],
      );
    }

    const claims: EchoClaim[] = [
      {
        kind: 'recorded_fact',
        text: `${key} = ${JSON.stringify(fact.value)} (${fact.kind}, confidence ${fact.confidence}).`,
        citations: [factCitation(fact)],
      },
    ];

    const sourceEvent = scope.events.find((event) => event.eventId === fact.sourceEventId);
    let status: EchoAnswer['status'] = 'grounded';
    if (sourceEvent) {
      claims.push({
        kind: 'recorded_event',
        text: `The fact was asserted by ${sourceEvent.type} at sequence ${sourceEvent.sequenceNo}.`,
        citations: [eventCitation(sourceEvent, 'Source record')],
      });
    } else {
      status = 'partial';
      claims.push({
        kind: 'unavailable',
        text: 'The fact carries a source event id that is not present in this branch lineage.',
        citations: [factCitation(fact)],
      });
    }

    if (fact.kind === 'derived' && fact.source.ref.startsWith('rule.')) {
      const ruleId = fact.source.ref.slice('rule.'.length);
      const rule = this.content.rules.find((candidate) => candidate.ruleId === ruleId);
      claims.push({
        kind: 'derived_conclusion',
        text: rule
          ? `The engine derived this fact with ${ruleId}: ${rule.description}`
          : `The engine derived this fact with ${ruleId}.`,
        citations: [
          {
            kind: 'rule',
            id: ruleId,
            label: rule?.description ?? ruleId,
            branchId: String(scope.branchId),
            sequenceNo: null,
          },
        ],
      });
    }

    const assertions = scope.events.filter(
      (event) => event.type === 'fact.asserted' && event.payload.fact.key === key,
    );
    if (assertions.length > 1) {
      claims.push({
        kind: 'derived_conclusion',
        text: `This key was asserted ${assertions.length} times on this lineage; the latest assertion is the current value.`,
        citations: assertions.map((event) => eventCitation(event, `Assertion of ${key}`)),
      });
    }

    return this.answer(
      query,
      scope,
      status,
      `${key} is recorded on ${this.branchLabel(scope)} as ${JSON.stringify(fact.value)}.`,
      claims,
      [],
    );
  }

  explainDecision(nodeId: string, branchId?: BranchId): EchoAnswer {
    const query: EchoQuery = { kind: 'decision', nodeId, branchId };
    const scope = this.scope(branchId);
    if (!scope) return this.unknown(query, 'That timeline is not retained in this session.', [nodeId]);

    const node = this.content.choices.find((candidate) => candidate.nodeId === nodeId);
    if (!node) {
      return this.unknown(query, `No decision node named ${nodeId} exists in this content.`, [nodeId]);
    }

    const choice = scope.state.choices.find((candidate) => candidate.nodeId === nodeId);
    if (!choice) {
      const missing = node.requires.filter((key) => scope.state.facts[key] === undefined);
      const scopeCitations = scope.summary ? [branchCitation(scope.summary)] : [];
      const claims: EchoClaim[] = [
        {
          kind: 'unavailable',
          text: `No decision has been committed at ${nodeId} on ${this.branchLabel(scope)}.`,
          citations: scopeCitations,
        },
      ];
      if (missing.length > 0) {
        claims.push({
          kind: 'inference',
          text: `The engine would refuse it until these facts exist: ${missing.join(', ')}.`,
          citations: scopeCitations,
        });
      }
      return this.answer(
        query,
        scope,
        'partial',
        `That decision is not on the record yet on ${this.branchLabel(scope)}.`,
        claims,
        missing,
      );
    }

    const option = node.options.find((candidate) => candidate.optionId === choice.optionId);
    const choiceEvent = scope.events.find((event) => event.eventId === choice.sourceEventId);
    const claims: EchoClaim[] = [
      {
        kind: 'recorded_event',
        text: `The player chose "${option?.label ?? choice.optionId}" at ${nodeId}.`,
        citations: [
          choiceCitation(choice),
          ...(choiceEvent ? [eventCitation(choiceEvent, 'Decision committed')] : []),
        ],
      },
    ];

    for (const key of option?.consequenceKeys ?? []) {
      const fact = scope.state.facts[key];
      if (fact) {
        claims.push({
          kind: 'recorded_fact',
          text: `The consequence ${key} is recorded as ${JSON.stringify(fact.value)}.`,
          citations: [factCitation(fact)],
        });
      } else {
        claims.push({
          kind: 'inference',
          text: `${key} is expected to be affected but has no recorded value on this branch yet.`,
          citations: [
            choiceCitation(choice),
            ...(choiceEvent ? [eventCitation(choiceEvent, 'Decision committed')] : []),
          ],
        });
      }
    }

    return this.answer(
      query,
      scope,
      'grounded',
      `${nodeId} was decided on ${this.branchLabel(scope)}.`,
      claims,
      [],
    );
  }

  explainMorrow(branchId?: BranchId): EchoAnswer {
    const query: EchoQuery = { kind: 'morrow', branchId };
    const scope = this.scope(branchId);
    if (!scope) return this.unknown(query, 'That timeline is not retained in this session.', []);

    const proposals = scope.events.filter(
      (event) => event.type === 'morrow.proposal.evaluated',
    );
    const interventions = scope.events.filter((event) => event.type === 'morrow.intervened');

    if (proposals.length === 0 && interventions.length === 0) {
      return this.answer(
        query,
        scope,
        'unknown',
        `MORROW has recorded no proposals or interventions on ${this.branchLabel(scope)}.`,
        [
          {
            kind: 'unavailable',
            text: 'There is nothing in the branch event log to explain.',
            citations: scope.summary ? [branchCitation(scope.summary)] : [],
          },
        ],
        ['morrow.intervened'],
      );
    }

    const claims: EchoClaim[] = [];
    for (const event of interventions) {
      if (event.type !== 'morrow.intervened') continue;
      const proposal = proposals.find(
        (candidate) =>
          candidate.type === 'morrow.proposal.evaluated' &&
          candidate.payload.proposalId === event.payload.proposalId &&
          candidate.payload.status === 'accepted',
      );
      claims.push({
        kind: 'recorded_event',
        text: `MORROW applied "${event.payload.response}" at sequence ${event.sequenceNo}, escalation ${event.payload.escalation}, reasons ${event.payload.reasonCodes.join(', ')}.`,
        citations: [
          eventCitation(event, 'MORROW intervention'),
          ...(proposal ? [eventCitation(proposal, 'Accepted proposal')] : []),
        ],
      });
    }

    for (const event of proposals) {
      if (event.type !== 'morrow.proposal.evaluated') continue;
      if (event.payload.status !== 'rejected') continue;
      claims.push({
        kind: 'recorded_event',
        text: `MORROW proposed "${event.payload.response}" but the engine rejected it: ${event.payload.reason ?? 'no reason recorded'}.`,
        citations: [eventCitation(event, 'Rejected proposal')],
      });
    }

    const responseFact = scope.state.facts['morrow.response'];
    if (responseFact) {
      claims.push({
        kind: 'recorded_fact',
        text: `The current recorded posture is ${JSON.stringify(responseFact.value)}.`,
        citations: [factCitation(responseFact)],
      });
    }

    return this.answer(
      query,
      scope,
      'grounded',
      `MORROW has ${interventions.length} recorded intervention${interventions.length === 1 ? '' : 's'} on ${this.branchLabel(scope)}.`,
      claims,
      [],
    );
  }

  explainEnding(branchId?: BranchId): EchoAnswer {
    const query: EchoQuery = { kind: 'ending', branchId };
    const scope = this.scope(branchId);
    if (!scope) return this.unknown(query, 'That timeline is not retained in this session.', []);

    if (scope.state.endingId === null) {
      return this.answer(
        query,
        scope,
        'unknown',
        `No ending has been committed on ${this.branchLabel(scope)}.`,
        [
          {
            kind: 'unavailable',
            text: 'The branch has not reached a recorded ending.',
            citations: scope.summary ? [branchCitation(scope.summary)] : [],
          },
        ],
        ['ending.reached'],
      );
    }

    const endingEvent = [...scope.events]
      .reverse()
      .find((event) => event.type === 'ending.reached');
    const definition = this.content.endings.find(
      (candidate) => candidate.endingId === scope.state.endingId,
    );
    const claims: EchoClaim[] = [];

    if (endingEvent && endingEvent.type === 'ending.reached') {
      claims.push({
        kind: 'recorded_event',
        text: `The engine committed ${endingEvent.payload.endingId} at sequence ${endingEvent.sequenceNo}.`,
        citations: [eventCitation(endingEvent, 'Ending event')],
      });
      const causeRules = endingEvent.payload.factKeys;
      if (causeRules.length > 0) {
        claims.push({
          kind: 'inference',
          text: `The ending event lists these asserted fact keys: ${causeRules.join(', ')}.`,
          citations: causeRules
            .map((key) => scope.state.facts[key])
            .filter((fact): fact is Fact => fact !== undefined)
            .map(factCitation),
        });
      }
    } else {
      claims.push({
        kind: 'unavailable',
        text: 'The ending is present in state but its event is not in this branch lineage.',
        citations: [],
      });
    }

    if (definition) {
      claims.push({
        kind: 'derived_conclusion',
        text: `${label(definition)}: ${definition.summary}`,
        citations: [
          {
            kind: 'ending',
            id: definition.endingId,
            label: definition.title,
            branchId: String(scope.branchId),
            sequenceNo: null,
          },
        ],
      });
    }

    const reachingRules = this.content.rules.filter((rule) =>
      rule.effects.some(
        (effect) => effect.kind === 'set_ending' && effect.endingId === scope.state.endingId,
      ),
    );
    for (const rule of reachingRules) {
      claims.push({
        kind: 'derived_conclusion',
        text: `Rule ${rule.ruleId} can commit this ending: ${rule.description}`,
        citations: [
          {
            kind: 'rule',
            id: rule.ruleId,
            label: rule.description,
            branchId: String(scope.branchId),
            sequenceNo: null,
          },
        ],
      });
    }

    return this.answer(
      query,
      scope,
      endingEvent ? 'grounded' : 'partial',
      `${this.branchLabel(scope)} reached ${definition?.title ?? scope.state.endingId}.`,
      claims,
      [],
    );
  }

  explainComparison(baseBranchId: BranchId, otherBranchId: BranchId): EchoAnswer {
    const query: EchoQuery = { kind: 'compare', baseBranchId, otherBranchId };
    let comparison;
    try {
      comparison = this.session.compareBranches(baseBranchId, otherBranchId);
    } catch {
      return this.unknown(query, 'One or both timelines are not retained in this session.', [
        String(baseBranchId),
        String(otherBranchId),
      ]);
    }

    const base = comparison.base;
    const other = comparison.other;
    const claims: EchoClaim[] = [
      {
        kind: 'recorded_fact',
        text: `Comparing V${base.timelineIndex + 1} (${base.label}) with V${other.timelineIndex + 1} (${other.label}).`,
        citations: [branchCitation(base), branchCitation(other)],
      },
    ];

    if (comparison.forkPoint) {
      claims.push({
        kind: 'recorded_event',
        text: `The timelines share history up to anchor ${comparison.forkPoint.anchorId} at version ${comparison.forkPoint.stateVersion}.`,
        citations: [
          {
            kind: 'anchor',
            id: comparison.forkPoint.anchorId,
            label: 'Fork checkpoint',
            branchId: String(comparison.forkPoint.branchId),
            sequenceNo: comparison.forkPoint.eventSequenceNo,
          },
        ],
      });
    }

    for (const difference of comparison.changedFacts) {
      claims.push({
        kind: 'derived_conclusion',
        text: `${difference.key}: V${base.timelineIndex + 1} = ${JSON.stringify(difference.base)}, V${other.timelineIndex + 1} = ${JSON.stringify(difference.other)}.`,
        citations: [branchCitation(base), branchCitation(other)],
      });
    }
    for (const key of comparison.onlyInBase) {
      claims.push({
        kind: 'derived_conclusion',
        text: `${key} exists only on V${base.timelineIndex + 1}.`,
        citations: [branchCitation(base)],
      });
    }
    for (const key of comparison.onlyInOther) {
      claims.push({
        kind: 'derived_conclusion',
        text: `${key} exists only on V${other.timelineIndex + 1}.`,
        citations: [branchCitation(other)],
      });
    }
    for (const choice of comparison.choices.filter((item) => item.divergent)) {
      claims.push({
        kind: 'derived_conclusion',
        text: `${choice.nodeId}: V${base.timelineIndex + 1} chose ${choice.baseOptionId ?? 'nothing'}, V${other.timelineIndex + 1} chose ${choice.otherOptionId ?? 'nothing'}.`,
        citations: [branchCitation(base), branchCitation(other)],
      });
    }
    if (comparison.endings.base !== comparison.endings.other) {
      claims.push({
        kind: 'derived_conclusion',
        text: `Endings diverge: V${base.timelineIndex + 1} = ${comparison.endings.base ?? 'none'}, V${other.timelineIndex + 1} = ${comparison.endings.other ?? 'none'}.`,
        citations: [branchCitation(base), branchCitation(other)],
      });
    }

    const anchors = [...anchorCitations(this.sessionState(baseBranchId)), ...anchorCitations(this.sessionState(otherBranchId))];
    if (anchors.length > 0) {
      claims.push({
        kind: 'recorded_event',
        text: `${anchors.length} anchor record${anchors.length === 1 ? '' : 's'} are retained across both timelines.`,
        citations: anchors,
      });
    }

    return {
      query,
      status: 'grounded',
      summary: `${comparison.events.shared} shared events, ${comparison.events.baseOnly} only in V${base.timelineIndex + 1}, ${comparison.events.otherOnly} only in V${other.timelineIndex + 1}.`,
      claims,
      missing: [],
      branchId: String(otherBranchId),
      branchLabel: `V${other.timelineIndex + 1} ${other.label}`,
    };
  }

  private scope(branchId?: BranchId): Scope | null {
    const id = branchId ?? this.session.getActiveBranchId();
    const state = this.session.getBranchState(id);
    if (!state) return null;
    const events = this.session.getLineageEvents(id);
    const summary = this.session.listBranches().find((branch) => branch.branchId === id) ?? null;
    return { branchId: id, state, events, summary };
  }

  private sessionState(branchId: BranchId): GameState {
    return this.session.getBranchState(branchId) ?? this.session.getState();
  }

  private branchLabel(scope: Scope): string {
    return scope.summary
      ? `V${scope.summary.timelineIndex + 1} ${scope.summary.label}`
      : String(scope.branchId);
  }

  private situationSummary(scope: Scope): string {
    return `${this.branchLabel(scope)}: phase ${JSON.stringify(scope.state.facts['story.phase']?.value ?? null)}, ${Object.keys(scope.state.facts).filter((key) => key.startsWith('evidence.')).length} evidence facts, ending ${scope.state.endingId ?? 'none'}.`;
  }

  private answer(
    query: EchoQuery,
    scope: Scope,
    status: EchoAnswer['status'],
    summary: string,
    claims: readonly EchoClaim[],
    missing: readonly string[],
  ): EchoAnswer {
    return {
      query,
      status,
      summary,
      claims,
      missing,
      branchId: String(scope.branchId),
      branchLabel: this.branchLabel(scope),
    };
  }

  private unknown(query: EchoQuery, summary: string, missing: readonly string[]): EchoAnswer {
    return {
      query,
      status: 'unknown',
      summary,
      claims: [
        {
          kind: 'unavailable',
          text: 'I cannot establish that from the canonical records available in this scope.',
          citations: [],
        },
      ],
      missing,
      branchId: null,
      branchLabel: null,
    };
  }
}
