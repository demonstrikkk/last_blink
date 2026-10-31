import {
  CONTRACT_VERSION,
  type BranchId,
  type GameEvent,
  type GameEventId,
  type GameState,
  type MorrowObservation,
  morrowObservationSchema,
} from '../contracts/index.js';
import {
  MORROW_POLICY_ID,
  MORROW_POLICY_VERSION,
} from '../contracts/morrow.js';
import { hashCanonical } from '../core/hash.js';
import { morrowEscalationOf, morrowResponseOf } from './fairness.js';

/**
 * The only surface MORROW may observe. It deliberately exposes no other
 * branch's runtime and no post-fork parent events: `getLineageEvents` already
 * applies the Stage 6 ancestry cutoff.
 */
export interface MorrowObservationSource {
  getState(): GameState;
  getActiveBranchId(): BranchId;
  getLineageEvents(branchId?: BranchId): readonly GameEvent[];
}

export interface MorrowObserveOptions {
  readonly triggerEventId?: GameEventId | null;
  readonly recentEventLimit?: number;
  readonly nowIso: () => string;
}

function stringFact(state: GameState, key: string): string | null {
  const value = state.facts[key]?.value;
  return typeof value === 'string' ? value : null;
}

export function buildMorrowObservation(
  source: MorrowObservationSource,
  options: MorrowObserveOptions,
): MorrowObservation {
  const state = source.getState();
  const branchId = source.getActiveBranchId();
  const events = source.getLineageEvents(branchId);
  const limit = Math.max(1, Math.min(options.recentEventLimit ?? 12, 32));

  const evidenceKeys = Object.keys(state.facts)
    .filter((key) => key.startsWith('evidence.'))
    .sort();
  const choices = [...state.choices]
    .sort((left, right) => (left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0))
    .map((choice) => ({ nodeId: choice.nodeId, optionId: choice.optionId }));

  const features = {
    evidenceKeys,
    evidenceCount: evidenceKeys.length,
    choices,
    choicesMade: choices.length,
    phase: stringFact(state, 'story.phase'),
    scrutiny: stringFact(state, 'world.morrow_scrutiny'),
    wardAlert: stringFact(state, 'world.ward_alert'),
    dispatchContinuity: stringFact(state, 'world.dispatch_continuity'),
    vendorConfidence: stringFact(state, 'world.vendor_confidence'),
    lastResponse: morrowResponseOf(state),
    escalation: morrowEscalationOf(state),
    recentEventTypes: events.slice(-limit).map((event) => event.type),
    endingId: state.endingId,
  } as const;

  const triggerEventId = options.triggerEventId ?? null;
  const observationHash = hashCanonical({
    sessionId: state.sessionId,
    branchId,
    tick: state.tick,
    stateVersion: state.stateVersion,
    policyId: MORROW_POLICY_ID,
    policyVersion: MORROW_POLICY_VERSION,
    triggerEventId,
    features,
  });

  return morrowObservationSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    observationId: `obs_${observationHash}`,
    sessionId: state.sessionId,
    branchId,
    tick: state.tick,
    stateVersion: state.stateVersion,
    policyId: MORROW_POLICY_ID,
    policyVersion: MORROW_POLICY_VERSION,
    triggerEventId,
    features,
    observationHash,
    createdAt: options.nowIso(),
  });
}
