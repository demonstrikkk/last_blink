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
import { IVO, SABLE, STAGE9_NPC_LIST } from '../../content/npcContent.js';

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

/**
 * Default cognition for every authored city NPC. It observes the facts the
 * definition allows and proposes a single no-op turn when the investigation
 * has produced visible evidence. Unregistered characters therefore never
 * freeze the turn loop: the controller can always fall back to this policy.
 */
export function createDefaultPolicy(definition: NpcDefinition): NpcPolicy {
  const policyId = `policy.npc.${definition.memoryNamespace}.scripted`;
  return {
    npcId: definition.npcId,
    policyId,
    policyVersion: POLICY_VERSION,
    evaluate(observation, memory) {
      const visibleEvidence = observation.visibleFacts.filter((fact) =>
        fact.key.startsWith('evidence.'),
      );
      if (visibleEvidence.length === 0) return null;
      const latest = visibleEvidence[visibleEvidence.length - 1]!.key;
      return noopProposal(
        observation,
        definition,
        policyId,
        memory.length > 0
          ? `${definition.displayName} is holding position; ${latest} is already on the branch.`
          : `${definition.displayName} acknowledges ${latest} and requests no world change.`,
        memory.length > 0 ? 0.5 : 0.55,
      );
    },
  };
}

/** Every authored NPC gets a registered policy; Sable and Ivo keep bespoke ones. */
export function createAllPolicies(): readonly NpcPolicy[] {
  return STAGE9_NPC_LIST.map((definition) => {
    if (definition.npcId === SABLE.npcId) return createSablePolicy();
    if (definition.npcId === IVO.npcId) return createIvoPolicy();
    return createDefaultPolicy(definition);
  });
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
