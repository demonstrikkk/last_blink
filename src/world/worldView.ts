import type { GameContent, GameState } from '../engine/index.js';

/**
 * The single projection from canonical facts to everything the HUD, the
 * dialogue sheet and the Phaser scene display. Neither renderer keeps its own
 * copy of a story fact: they both call this function (or read its output).
 */
export interface EvidenceView {
  readonly evidenceId: string;
  readonly factKey: string;
  readonly label: string;
  readonly summary: string;
  readonly collected: boolean;
  readonly available: boolean;
  readonly requires: readonly string[];
  readonly provenance: string;
  readonly sourceKind: string;
  readonly confidence: number;
}

export interface ChoiceOptionView {
  readonly optionId: string;
  readonly label: string;
  readonly detail: string;
}

export interface ChoiceView {
  readonly nodeId: string;
  readonly prompt: string;
  readonly options: readonly ChoiceOptionView[];
  readonly requires: readonly string[];
  readonly missing: readonly string[];
  readonly available: boolean;
  readonly resolvedOptionId: string | null;
  readonly resolvedOptionLabel: string | null;
}

export interface ObjectiveView {
  readonly objectiveId: string;
  readonly label: string;
  readonly detail: string;
  readonly done: boolean;
}

export interface EndingView {
  readonly endingId: string;
  readonly title: string;
  readonly summary: string;
}

export interface AnchorView {
  readonly label: string;
  readonly stateHash: string;
  readonly tick: number;
}

export interface WorldView {
  readonly district: string | null;
  readonly curfew: string | null;
  readonly relayStatus: string | null;
  readonly relayReady: boolean;
  readonly phase: string | null;
  readonly wardAlert: 'raised' | 'suppressed' | null;
  readonly sableStance: string | null;
  readonly sableTrust: string | null;
  readonly ivoStance: string | null;
  readonly dispatchContinuity: string | null;
  readonly vendorConfidence: string | null;
  readonly morrowScrutiny: string | null;
  readonly evidence: readonly EvidenceView[];
  readonly collectedEvidence: readonly EvidenceView[];
  readonly objectives: readonly ObjectiveView[];
  readonly currentObjective: ObjectiveView | null;
  readonly choices: readonly ChoiceView[];
  readonly choice: ChoiceView | null;
  readonly choiceResolved: boolean;
  readonly consequence: string;
  readonly endingId: string | null;
  readonly ending: EndingView | null;
  readonly anchors: readonly AnchorView[];
  readonly evidenceFound: number;
  readonly evidenceTotal: number;
  readonly choicesMade: number;
}

function factValue(state: GameState, key: string): unknown {
  return state.facts[key]?.value;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function missingKeys(state: GameState, requires: readonly string[]): string[] {
  return requires.filter((key) => state.facts[key] === undefined);
}

function choiceView(
  state: GameState,
  node: GameContent['choices'][number],
): ChoiceView {
  const committed = state.choices.find((choice) => choice.nodeId === node.nodeId);
  const committedOption = committed
    ? node.options.find((option) => option.optionId === committed.optionId)
    : undefined;
  const missing = missingKeys(state, node.requires);

  return {
    nodeId: node.nodeId,
    prompt: node.prompt,
    options: node.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      detail: option.detail,
    })),
    requires: node.requires,
    missing,
    available: committed === undefined && missing.length === 0,
    resolvedOptionId: committed?.optionId ?? null,
    resolvedOptionLabel: committedOption?.label ?? null,
  };
}

export function deriveWorldView(state: GameState, content: GameContent): WorldView {
  const evidence: EvidenceView[] = content.evidence.map((definition) => {
    const fact = state.facts[definition.factKey];
    const missing = missingKeys(state, definition.requires);
    return {
      evidenceId: definition.evidenceId,
      factKey: definition.factKey,
      label: definition.label,
      summary: definition.summary,
      collected: fact !== undefined,
      available: fact === undefined && missing.length === 0,
      requires: definition.requires,
      provenance: fact?.source.ref ?? definition.sourceRef,
      sourceKind: fact?.source.kind ?? definition.sourceKind,
      confidence: fact?.confidence ?? definition.confidence,
    };
  });

  const objectives: ObjectiveView[] = content.objectives.map((definition) => ({
    objectiveId: definition.objectiveId,
    label: definition.label,
    detail: definition.detail,
    done: missingKeys(state, definition.requires).length === 0,
  }));

  const choices = content.choices.map((node) => choiceView(state, node));
  const choiceNode = choices[0] ?? null;
  const committed = choiceNode
    ? state.choices.find((candidate) => candidate.nodeId === choiceNode.nodeId)
    : undefined;

  const wardAlertRaw = asString(factValue(state, 'world.ward_alert'));
  const wardAlert =
    wardAlertRaw === 'raised' || wardAlertRaw === 'suppressed' ? wardAlertRaw : null;

  const endingId = state.endingId;
  const endingDefinition = endingId
    ? content.endings.find((definition) => definition.endingId === endingId)
    : undefined;
  const ending: EndingView | null = endingId
    ? {
        endingId,
        title: endingDefinition?.title ?? endingId,
        summary: endingDefinition?.summary ?? 'The engine recorded an ending.',
      }
    : null;

  return {
    district: asString(factValue(state, 'world.district')),
    curfew: asString(factValue(state, 'world.curfew')),
    relayStatus: asString(factValue(state, 'story.relay_status')),
    relayReady: factValue(state, 'story.relay_ready') === true,
    phase: asString(factValue(state, 'story.phase')),
    wardAlert,
    sableStance: asString(factValue(state, 'npc.sable.stance')),
    sableTrust: asString(factValue(state, 'npc.sable.trust')),
    ivoStance: asString(factValue(state, 'npc.ivo.stance')),
    dispatchContinuity: asString(factValue(state, 'world.dispatch_continuity')),
    vendorConfidence: asString(factValue(state, 'world.vendor_confidence')),
    morrowScrutiny: asString(factValue(state, 'world.morrow_scrutiny')),
    evidence,
    collectedEvidence: evidence.filter((item) => item.collected),
    objectives,
    currentObjective: objectives.find((objective) => !objective.done) ?? null,
    choices,
    choice: choiceNode,
    choiceResolved: committed !== undefined,
    consequence: describeConsequence(wardAlert, committed?.optionId ?? null),
    endingId,
    ending,
    anchors: state.anchors.map((anchor) => ({
      label: anchor.label,
      stateHash: anchor.stateHash,
      tick: anchor.tick,
    })),
    evidenceFound: state.player.progress.evidenceFound,
    evidenceTotal: evidence.length,
    choicesMade: state.player.progress.choicesMade,
  };
}

export function describeConsequence(
  wardAlert: 'raised' | 'suppressed' | null,
  optionId: string | null,
): string {
  if (wardAlert === 'raised') {
    return 'Ward patrols are moving on Relay 7. The eight minutes are now part of the public record.';
  }
  if (wardAlert === 'suppressed') {
    return 'Relay 7 stays dark. The ward has no reason to look, and Sable keeps your secret.';
  }
  if (optionId !== null) {
    return 'The decision is recorded. The street has not answered yet.';
  }
  return 'No decision has been made. Sable is waiting by the relay.';
}

/** Availability used by the scene and the HUD prompt. */
export function targetAvailable(view: WorldView, targetId: string): boolean {
  const evidenceItem = view.evidence.find((item) => item.evidenceId === targetId);
  if (evidenceItem) return evidenceItem.available;
  if (targetId === 'anchor_lamp') return view.anchors.length === 0;
  return true;
}
