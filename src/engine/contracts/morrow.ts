import { z } from 'zod';
import {
  branchIdSchema,
  contractVersionSchema,
  eventIdSchema,
  hashSchema,
  isoTimestampSchema,
  jsonValueSchema,
  observationIdSchema,
  proposalIdSchema,
  sessionIdSchema,
  stateVersionSchema,
  tickSchema,
  versionSchema,
} from './primitives.js';

/**
 * Stage 7 MORROW policy contracts.
 *
 * These are intentionally not registered in `CONTRACT_REGISTRY`: they describe
 * a runtime policy exchange, not durable save data. Registering them would add
 * a new required key to every SaveEnvelope and break Stage 6 saves. The
 * additive GameEvent variants they produce *are* part of the frozen event
 * contract; see docs/adr/0016-morrow-echo-additive-contracts.md.
 */
export const MORROW_POLICY_ID = 'policy.morrow.deterministic';
export const MORROW_POLICY_VERSION = '1.0.0';
export const MORROW_POLICY_OWNER = 'ai-runtime';

/** Hard ceiling on escalation. The engine refuses anything above this. */
export const MAX_MORROW_ESCALATION = 3;

export const morrowResponseSchema = z.enum([
  'observe',
  'warn',
  'restrict',
  'redirect',
  'escalate',
  'release',
]);

export type MorrowResponse = z.infer<typeof morrowResponseSchema>;

export const MORROW_RESPONSES: readonly MorrowResponse[] = [
  'observe',
  'warn',
  'restrict',
  'redirect',
  'escalate',
  'release',
] as const;

export const morrowReasonCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{2,47}$/, 'reason codes are upper snake case');

export const morrowChoiceFeatureSchema = z.strictObject({
  nodeId: z.string().trim().min(1).max(80),
  optionId: z.string().trim().min(1).max(60),
});

/**
 * Explicit, documented player/investigation features. Every field is derived
 * from the active branch's canonical state only; there is no hidden input.
 */
export const morrowObservationFeaturesSchema = z.strictObject({
  evidenceKeys: z.array(z.string().trim().min(1).max(120)).max(32),
  evidenceCount: z.number().int().nonnegative().max(64),
  choices: z.array(morrowChoiceFeatureSchema).max(32),
  choicesMade: z.number().int().nonnegative().max(512),
  phase: z.string().trim().min(1).max(40).nullable(),
  scrutiny: z.string().trim().min(1).max(40).nullable(),
  wardAlert: z.string().trim().min(1).max(40).nullable(),
  dispatchContinuity: z.string().trim().min(1).max(40).nullable(),
  vendorConfidence: z.string().trim().min(1).max(40).nullable(),
  lastResponse: morrowResponseSchema.nullable(),
  escalation: z.number().int().min(0).max(MAX_MORROW_ESCALATION),
  recentEventTypes: z.array(z.string().trim().min(1).max(48)).max(32),
  endingId: z.string().trim().min(1).max(64).nullable(),
});

export type MorrowObservationFeatures = z.infer<typeof morrowObservationFeaturesSchema>;

export const morrowObservationSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  observationId: observationIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  tick: tickSchema,
  stateVersion: stateVersionSchema,
  policyId: z.string().trim().min(1).max(80),
  policyVersion: versionSchema,
  triggerEventId: eventIdSchema.nullable(),
  features: morrowObservationFeaturesSchema,
  observationHash: hashSchema,
  createdAt: isoTimestampSchema,
});

export type MorrowObservation = z.infer<typeof morrowObservationSchema>;

export const morrowProposalSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  proposalId: proposalIdSchema,
  policyId: z.string().trim().min(1).max(80),
  policyVersion: versionSchema,
  observationId: observationIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  tick: tickSchema,
  basedOnStateVersion: stateVersionSchema,
  response: morrowResponseSchema,
  reasonCodes: z.array(morrowReasonCodeSchema).min(1).max(8),
  features: z.record(z.string(), jsonValueSchema),
  observationHash: hashSchema,
  deterministic: z.literal(true),
});

export type MorrowProposal = z.infer<typeof morrowProposalSchema>;

export interface MorrowPolicy {
  readonly policyId: string;
  readonly policyVersion: string;
  propose(observation: MorrowObservation): MorrowProposal;
}
