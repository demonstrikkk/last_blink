import { z } from 'zod';
import {
  branchIdSchema,
  confidenceSchema,
  contractVersionSchema,
  isoTimestampSchema,
  jsonObjectSchema,
  manifestIdSchema,
  npcActionTypeSchema,
  npcIdSchema,
  observationIdSchema,
  proposalIdSchema,
  sessionIdSchema,
  tickSchema,
} from './primitives.js';

export const proposedActionSchema = z.strictObject({
  actionType: npcActionTypeSchema,
  targetId: z.string().trim().min(1).max(64).nullable(),
  params: jsonObjectSchema,
});

/**
 * A proposal is untrusted input. `requiresValidation` is a literal `true` and
 * the engine never applies a proposal without producing an ActionResult.
 */
export const npcDecisionProposalSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  proposalId: proposalIdSchema,
  npcId: npcIdSchema,
  observationId: observationIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  tick: tickSchema,
  proposedActions: z.array(proposedActionSchema).min(1).max(4),
  rationale: z.string().trim().min(1).max(600),
  confidence: confidenceSchema,
  modelManifestId: manifestIdSchema.nullable(),
  requiresValidation: z.literal(true),
  createdAt: isoTimestampSchema,
});

export type NpcDecisionProposal = z.infer<typeof npcDecisionProposalSchema>;
export type ProposedAction = z.infer<typeof proposedActionSchema>;
