import {
  CONTRACT_VERSION,
  npcObservationSchema,
  type BranchId,
  type GameEvent,
  type GameState,
  type NpcDefinition,
  type NpcObservation,
} from '../contracts/index.js';
import { hashCanonical } from '../core/hash.js';

export interface NpcObservationSource {
  getState(): GameState;
  getActiveBranchId(): BranchId;
  getLineageEvents(branchId?: BranchId): readonly GameEvent[];
}

export interface NpcObserveOptions {
  readonly definition: NpcDefinition;
  readonly nowIso: () => string;
  readonly recentEventLimit?: number;
}

function isVisible(definition: NpcDefinition, key: string): boolean {
  return definition.permissions.observableFactPrefixes.some((prefix) =>
    key.startsWith(prefix),
  );
}

export function buildNpcObservation(
  source: NpcObservationSource,
  options: NpcObserveOptions,
): NpcObservation {
  const state = source.getState();
  const branchId = source.getActiveBranchId();
  const events = source.getLineageEvents(branchId);
  const limit = Math.max(1, Math.min(options.recentEventLimit ?? 12, 32));

  const visibleFacts = Object.values(state.facts)
    .filter((fact) => isVisible(options.definition, fact.key))
    .sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    )
    .map((fact) => ({
      factId: fact.factId,
      key: fact.key,
      value: fact.value,
      confidence: fact.confidence,
    }));

  const recentEventIds = events.slice(-limit).map((event) => event.eventId);

  const payload = {
    npcId: options.definition.npcId,
    sessionId: state.sessionId,
    branchId,
    tick: state.tick,
    stateVersion: state.stateVersion,
    visibleFacts,
    recentEventIds,
    modelManifestId: options.definition.modelManifestId,
  };
  const perceptionHash = hashCanonical(payload);

  return npcObservationSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    observationId: `obs_${perceptionHash}`,
    ...payload,
    perceptionHash,
    createdAt: options.nowIso(),
  });
}
