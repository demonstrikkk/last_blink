import { z } from 'zod';
import { branchIdSchema, contractVersionSchema, sessionIdSchema, tickSchema } from './primitives.js';

export const caseRelationSchema = z.enum(['supports', 'contradicts', 'corroborates', 'uncertain']);
const caseIdSchema = z.string().regex(/^[a-z][a-z0-9_]{3,80}$/);
const evidenceIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,60}$/);

export const caseLinkSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  linkId: caseIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  leftEvidenceId: evidenceIdSchema,
  rightEvidenceId: evidenceIdSchema,
  relation: caseRelationSchema,
  note: z.string().trim().min(1).max(400),
  createdAtTick: tickSchema,
  revisedAtTick: tickSchema,
});

export const caseHypothesisSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  hypothesisId: caseIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  text: z.string().trim().min(3).max(240),
  supportingEvidenceIds: z.array(evidenceIdSchema).max(24),
  opposingEvidenceIds: z.array(evidenceIdSchema).max(24),
  status: z.enum(['open', 'supported', 'contradicted', 'inconclusive']),
  createdAtTick: tickSchema,
  revisedAtTick: tickSchema,
});

export type CaseLink = z.infer<typeof caseLinkSchema>;
export type CaseHypothesis = z.infer<typeof caseHypothesisSchema>;
