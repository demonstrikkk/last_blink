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
  readonly verificationStatus: 'verified_record' | 'unverified_claim' | 'uncollected';
  readonly discoveryContext: string;
  readonly contradictionNote: string | null;
  readonly relatedRef: string;
  readonly timelineBranch: string;
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
  readonly completionCondition: string;
}

export interface DiscrepancyView {
  readonly id: string;
  readonly title: string;
  readonly claim: string;
  readonly contradiction: string;
  readonly status: 'active' | 'resolved' | 'pending';
}

export interface EndingView {
  readonly endingId: string;
  readonly title: string;
  readonly summary: string;
}

export interface AnchorView {
  readonly anchorId: string;
  readonly label: string;
  readonly stateHash: string;
  readonly tick: number;
  readonly stateVersion: number;
  readonly eventSequenceNo: number;
  /** Label of the child timeline forked from this anchor, if any. */
  readonly forkedInto: string | null;
}

export interface TimelineView {
  readonly branchId: string;
  readonly index: number;
  readonly total: number;
  readonly label: string;
  readonly parentLabel: string | null;
  readonly forkedFromAnchorId: string | null;
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
  readonly discrepancies: readonly DiscrepancyView[];
  readonly choices: readonly ChoiceView[];
  readonly choice: ChoiceView | null;
  readonly choiceResolved: boolean;
  readonly consequence: string;
  readonly endingId: string | null;
  readonly ending: EndingView | null;
  readonly timeline: TimelineView;
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

function describeObjectiveCondition(objectiveId: string, requires: readonly string[]): string {
  switch (objectiveId) {
    case 'obj_read_relay':
      return 'Inspect Relay 7 terminal on north kerb to recover evidence.relay_7';
    case 'obj_decide_relay':
      return 'Converse with Sable and commit story.relay_choice_resolved (share or conceal)';
    case 'obj_find_dispatch':
      return 'Inspect North Walk dispatch board to recover evidence.ward_dispatch';
    case 'obj_hear_ivo':
      return 'Converse with Ivo on South Walk to record evidence.vendor_testimony';
    case 'obj_decide_vendor':
      return 'Commit story.vendor_choice_resolved (protect or name Ivo) with witness';
    case 'obj_make_call':
      return 'Use the East Walk call-box to submit or close the ward line (story.ward_call)';
    default:
      return `Requires canonical facts: ${requires.join(', ')}`;
  }
}

export function deriveWorldView(state: GameState, content: GameContent): WorldView {
  const activeBranch = state.branches.find((branch) => branch.branchId === state.branchId);
  const parentBranch = activeBranch?.parentBranchId
    ? state.branches.find((branch) => branch.branchId === activeBranch.parentBranchId)
    : undefined;
  const branchLabel = activeBranch?.label ?? 'Original timeline';

  const evidence: EvidenceView[] = content.evidence.map((definition) => {
    const fact = state.facts[definition.factKey];
    const missing = missingKeys(state, definition.requires);
    const collected = fact !== undefined;
    const sourceKind = fact?.source.kind ?? definition.sourceKind;

    let discoveryContext = definition.sourceRef;
    let contradictionNote: string | null = null;
    let relatedRef = 'Relay Street investigation';

    if (definition.evidenceId === 'relay_7_log') {
      discoveryContext = 'North kerb terminal · direct hardware counter read';
      contradictionNote = 'Contradicts city-wide clock zeroing: recorded 8-minute duration';
      relatedRef = 'Related to 03:14 dispatch runner timing';
    } else if (definition.evidenceId === 'ward_dispatch') {
      discoveryContext = 'North walk board · handwritten desk log';
      contradictionNote = 'Contradicted by Ivo: courier had no sealed pouch and was in flight';
      relatedRef = 'Related to Relay 7 hardware clock log';
    } else if (definition.evidenceId === 'vendor_testimony') {
      discoveryContext = 'South walk stall · eyewitness account from stallholder';
      contradictionNote = 'Contradicts official ward dispatch claim of authorized sealed route';
      relatedRef = 'Related to ward dispatch slip 03:14';
    }

    const verificationStatus = !collected
      ? 'uncollected'
      : sourceKind === 'testimony'
        ? 'unverified_claim'
        : 'verified_record';

    return {
      evidenceId: definition.evidenceId,
      factKey: definition.factKey,
      label: definition.label,
      summary: definition.summary,
      collected,
      available: !collected && missing.length === 0,
      requires: definition.requires,
      provenance: fact?.source.ref ?? definition.sourceRef,
      sourceKind,
      confidence: fact?.confidence ?? definition.confidence,
      verificationStatus,
      discoveryContext,
      contradictionNote,
      relatedRef,
      timelineBranch: branchLabel,
    };
  });

  const objectives: ObjectiveView[] = content.objectives.map((definition) => ({
    objectiveId: definition.objectiveId,
    label: definition.label,
    detail: definition.detail,
    done: missingKeys(state, definition.requires).length === 0,
    completionCondition: describeObjectiveCondition(definition.objectiveId, definition.requires),
  }));

  const hasRelay7 = state.facts['evidence.relay_7'] !== undefined;
  const hasRelayChoice = state.facts['story.relay_choice_resolved'] !== undefined;
  const hasTestimony = state.facts['evidence.vendor_testimony'] !== undefined;
  const hasVendorChoice = state.facts['story.vendor_choice_resolved'] !== undefined;

  const discrepancies: DiscrepancyView[] = [
    {
      id: 'discrepancy_clock',
      title: 'Hardware Count vs City Clock Reset',
      claim: 'Ward authority records show all Aster district clocks synchronized and reset at midnight.',
      contradiction: 'Relay 7 hardware counter continuously logged 8 uncounted minutes during blackout.',
      status: hasRelay7 ? (hasRelayChoice ? 'resolved' : 'active') : 'pending',
    },
    {
      id: 'discrepancy_runner',
      title: 'Authorized Dispatch vs Unsealed Courier',
      claim: 'Handwritten dispatch slip states an authorized sealed courier left for Relay 7 at 03:14.',
      contradiction: 'Ivo testified the runner had torn clothing, no sealed pouch, and was fleeing in panic.',
      status: hasTestimony ? (hasVendorChoice ? 'resolved' : 'active') : 'pending',
    },
  ];

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
    discrepancies,
    choices,
    choice: choiceNode,
    choiceResolved: committed !== undefined,
    consequence: describeConsequence(wardAlert, committed?.optionId ?? null),
    endingId,
    ending,
    timeline: {
      branchId: state.branchId,
      index: activeBranch?.timelineIndex ?? 0,
      total: state.branches.length,
      label: branchLabel,
      parentLabel: parentBranch?.label ?? null,
      forkedFromAnchorId: activeBranch?.forkedAtAnchorId ?? null,
    },
    anchors: state.anchors.map((anchor) => ({
      anchorId: anchor.anchorId,
      label: anchor.label,
      stateHash: anchor.stateHash,
      tick: anchor.tick,
      stateVersion: anchor.stateVersion,
      eventSequenceNo: anchor.eventSequenceNo,
      forkedInto:
        state.branches.find((branch) => branch.forkedAtAnchorId === anchor.anchorId)?.label ?? null,
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
