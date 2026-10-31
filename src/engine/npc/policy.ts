import {
  CONTRACT_VERSION,
  npcDecisionProposalSchema,
  type MemoryRecord,
  type NpcDecisionProposal,
  type NpcDefinition,
  type NpcId,
  type NpcObservation,
} from '../contracts/index.js';
import { hashCanonical } from '../core/hash.js';
import { IVO, SABLE } from '../../content/npcContent.js';

export interface NpcPolicy {
  readonly npcId: NpcId;
  readonly policyId: string;
  readonly policyVersion: string;
  evaluate(
    observation: NpcObservation,
    memory: readonly MemoryRecord[],
  ): NpcDecisionProposal | null;
}

const POLICY_VERSION = '1.0.0';

function visible(observation: NpcObservation, key: string): boolean {
  return observation.visibleFacts.some((fact) => fact.key === key);
}

function noopProposal(
  observation: NpcObservation,
  definition: NpcDefinition,
  policyId: string,
  rationale: string,
  confidence: number,
): NpcDecisionProposal {
  const proposalId = `prp_${hashCanonical({
    observationId: observation.observationId,
    npcId: definition.npcId,
    policyId,
    rationale,
    confidence,
  })}`;

  return npcDecisionProposalSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    proposalId,
    npcId: definition.npcId,
    observationId: observation.observationId,
    sessionId: observation.sessionId,
    branchId: observation.branchId,
    tick: observation.tick,
    proposedActions: [
      { actionType: 'session.noop', targetId: null, params: {} },
    ],
    rationale,
    confidence,
    modelManifestId: definition.modelManifestId,
    requiresValidation: true,
    createdAt: observation.createdAt,
  });
}

export function createSablePolicy(): NpcPolicy {
  const definition = SABLE;
  return {
    npcId: definition.npcId,
    policyId: 'policy.npc.sable.scripted',
    policyVersion: POLICY_VERSION,
    evaluate(observation, memory) {
      if (
        !visible(observation, 'evidence.relay_7') ||
        visible(observation, 'story.relay_choice_resolved')
      ) {
        return null;
      }
      const prior = memory.length > 0;
      return noopProposal(
        observation,
        definition,
        'policy.npc.sable.scripted',
        prior
          ? 'Sable has read the relay log and is holding her position until the auditor decides what the ward sees.'
          : 'Sable has read the relay log. She is waiting to see whether the auditor tells the ward.',
        prior ? 0.65 : 0.6,
      );
    },
  };
}

export function createIvoPolicy(): NpcPolicy {
  const definition = IVO;
  return {
    npcId: definition.npcId,
    policyId: 'policy.npc.ivo.scripted',
    policyVersion: POLICY_VERSION,
    evaluate(observation, memory) {
      if (
        !visible(observation, 'evidence.vendor_testimony') ||
        visible(observation, 'story.vendor_choice_resolved')
      ) {
        return null;
      }
      const prior = memory.length > 0;
      return noopProposal(
        observation,
        definition,
        'policy.npc.ivo.scripted',
        prior
          ? 'Ivo has given his account and is waiting to learn whether his name enters the ward record.'
          : 'Ivo has given his account. He is waiting to see whether the auditor names him.',
        prior ? 0.65 : 0.6,
      );
    },
  };
}

export function createFallbackProposal(
  observation: NpcObservation,
  definition: NpcDefinition,
  reason: string,
): NpcDecisionProposal {
  return noopProposal(
    observation,
    definition,
    'policy.npc.fallback',
    `Deterministic fallback (${reason}): no narrative effect is requested.`,
    0,
  );
}
