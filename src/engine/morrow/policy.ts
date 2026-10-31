import {
  CONTRACT_VERSION,
  type MorrowObservation,
  type MorrowPolicy,
  type MorrowProposal,
  type MorrowResponse,
  morrowProposalSchema,
} from '../contracts/index.js';
import {
  MORROW_POLICY_ID,
  MORROW_POLICY_VERSION,
} from '../contracts/morrow.js';
import { hashCanonical } from '../core/hash.js';

/**
 * Deterministic Stage 7 baseline policy. This is the required policy: no model
 * is consulted, no wall clock is read, and the same observation always produces
 * the same proposal id, response and reason codes.
 *
 * It represents MORROW as a bounded risk posture rather than a storyteller:
 * evidence and investigation depth raise scrutiny; concealment escalates; an
 * ending always releases. The engine still validates every transition.
 */
function phaseRank(phase: string | null): number {
  switch (phase) {
    case 'arrival':
      return 0;
    case 'investigation':
      return 1;
    case 'decision':
      return 2;
    case 'accounting':
      return 3;
    case 'resolved':
      return 4;
    default:
      return 0;
  }
}

interface Decision {
  readonly response: MorrowResponse;
  readonly reasonCodes: string[];
}

export function decideMorrowResponse(observation: MorrowObservation): Decision {
  const features = observation.features;
  const current = features.lastResponse;
  const evidence = features.evidenceCount;
  const choices = features.choicesMade;
  const scrutiny = features.scrutiny;
  const depth = phaseRank(features.phase);

  if (features.endingId !== null) {
    return current === 'release'
      ? { response: 'observe', reasonCodes: ['ENDING_REACHED'] }
      : { response: 'release', reasonCodes: ['ENDING_RELEASE'] };
  }

  if (current === null) {
    return evidence >= 1
      ? { response: 'warn', reasonCodes: ['EVIDENCE_PRESSURE'] }
      : { response: 'observe', reasonCodes: ['BASELINE_OBSERVE'] };
  }

  if (current === 'observe') {
    return evidence >= 1 || choices >= 1 || depth >= 1
      ? { response: 'warn', reasonCodes: ['EVIDENCE_PRESSURE'] }
      : { response: 'observe', reasonCodes: ['NO_NEW_SIGNAL'] };
  }

  if (current === 'warn') {
    if (scrutiny === 'critical' || evidence >= 3 || choices >= 2 || depth >= 2) {
      return { response: 'restrict', reasonCodes: ['INVESTIGATION_DEPTH', 'SCRUTINY_RAISED'] };
    }
    if (evidence >= 2 || choices >= 1 || scrutiny === 'elevated') {
      return { response: 'restrict', reasonCodes: ['EVIDENCE_PRESSURE'] };
    }
    return { response: 'warn', reasonCodes: ['POSTURE_HOLD'] };
  }

  if (current === 'restrict') {
    if (scrutiny === 'critical' || evidence >= 3 || choices >= 2) {
      return { response: 'escalate', reasonCodes: ['ESCALATION_WARRANTED', 'SCRUTINY_CRITICAL'] };
    }
    return { response: 'restrict', reasonCodes: ['POSTURE_HOLD'] };
  }

  if (current === 'escalate') {
    return { response: 'escalate', reasonCodes: ['POSTURE_HOLD'] };
  }

  if (current === 'release') {
    return evidence >= 2 && choices >= 2
      ? { response: 'warn', reasonCodes: ['REOPENED_INVESTIGATION'] }
      : { response: 'release', reasonCodes: ['POSTURE_HOLD'] };
  }

  return { response: 'observe', reasonCodes: ['BASELINE_OBSERVE'] };
}

export function createDeterministicMorrowPolicy(): MorrowPolicy {
  return {
    policyId: MORROW_POLICY_ID,
    policyVersion: MORROW_POLICY_VERSION,
    propose(observation: MorrowObservation): MorrowProposal {
      const decision = decideMorrowResponse(observation);
      const proposalId = `prp_${hashCanonical({
        observationHash: observation.observationHash,
        response: decision.response,
        policyVersion: MORROW_POLICY_VERSION,
      })}`;

      return morrowProposalSchema.parse({
        schemaVersion: CONTRACT_VERSION,
        proposalId,
        policyId: MORROW_POLICY_ID,
        policyVersion: MORROW_POLICY_VERSION,
        observationId: observation.observationId,
        sessionId: observation.sessionId,
        branchId: observation.branchId,
        tick: observation.tick,
        basedOnStateVersion: observation.stateVersion,
        response: decision.response,
        reasonCodes: decision.reasonCodes,
        features: {
          evidenceCount: observation.features.evidenceCount,
          choicesMade: observation.features.choicesMade,
          phase: observation.features.phase,
          scrutiny: observation.features.scrutiny,
          wardAlert: observation.features.wardAlert,
          lastResponse: observation.features.lastResponse,
          escalation: observation.features.escalation,
          endingId: observation.features.endingId,
        },
        observationHash: observation.observationHash,
        deterministic: true,
      });
    },
  };
}
