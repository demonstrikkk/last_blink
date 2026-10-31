import type { GameContent } from '../engine/index.js';
import type { GameState } from '../engine/index.js';

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
  readonly resolvedOptionId: string | null;
  readonly resolvedOptionLabel: string | null;
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
  readonly wardAlert: 'raised' | 'suppressed' | null;
  readonly sableStance: string | null;
  readonly evidence: readonly EvidenceView[];
  readonly collectedEvidence: readonly EvidenceView[];
  readonly choice: ChoiceView | null;
  readonly choiceResolved: boolean;
  readonly consequence: string;
  readonly anchors: readonly AnchorView[];
  readonly evidenceFound: number;
  readonly choicesMade: number;
}

function factValue(state: GameState, key: string): unknown {
  return state.facts[key]?.value;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function deriveWorldView(state: GameState, content: GameContent): WorldView {
  const evidence: EvidenceView[] = content.evidence.map((definition) => ({
    evidenceId: definition.evidenceId,
    factKey: definition.factKey,
    label: definition.label,
    summary: definition.summary,
    collected: state.facts[definition.factKey] !== undefined,
  }));

  const choiceNode = content.choices[0] ?? null;
  const committed = choiceNode
    ? state.choices.find((choice) => choice.nodeId === choiceNode.nodeId)
    : undefined;
  const committedOption = committed
    ? choiceNode?.options.find((option) => option.optionId === committed.optionId)
    : undefined;

  const wardAlertRaw = asString(factValue(state, 'world.ward_alert'));
  const wardAlert =
    wardAlertRaw === 'raised' || wardAlertRaw === 'suppressed' ? wardAlertRaw : null;

  const choice: ChoiceView | null = choiceNode
    ? {
        nodeId: choiceNode.nodeId,
        prompt: choiceNode.prompt,
        options: choiceNode.options.map((option) => ({
          optionId: option.optionId,
          label: option.label,
          detail: option.detail,
        })),
        resolvedOptionId: committed?.optionId ?? null,
        resolvedOptionLabel: committedOption?.label ?? null,
      }
    : null;

  return {
    district: asString(factValue(state, 'world.district')),
    curfew: asString(factValue(state, 'world.curfew')),
    relayStatus: asString(factValue(state, 'story.relay_status')),
    relayReady: factValue(state, 'story.relay_ready') === true,
    wardAlert,
    sableStance: asString(factValue(state, 'npc.sable.stance')),
    evidence,
    collectedEvidence: evidence.filter((item) => item.collected),
    choice,
    choiceResolved: committed !== undefined,
    consequence: describeConsequence(wardAlert, committed?.optionId ?? null),
    anchors: state.anchors.map((anchor) => ({
      label: anchor.label,
      stateHash: anchor.stateHash,
      tick: anchor.tick,
    })),
    evidenceFound: state.player.progress.evidenceFound,
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
export function targetAvailable(
  view: WorldView,
  targetId: string,
): boolean {
  if (targetId === 'relay_7_log') return !view.evidence.some((item) => item.evidenceId === 'relay_7_log' && item.collected);
  if (targetId === 'sable') return true;
  if (targetId === 'anchor_lamp') return view.anchors.length === 0;
  return false;
}
