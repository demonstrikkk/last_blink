import { z } from 'zod';
import { branchIdSchema, contractVersionSchema, sessionIdSchema, tickSchema } from './primitives.js';

const evidenceIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,60}$/);

export const challengeTypeSchema = z.enum(['timeline_reconstruction', 'contradiction_questioning']);
export const challengeOutcomeSchema = z.enum(['verified_sequence', 'verified_contradiction_follow_up']);

export const challengeResultSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  challengeId: z.string().regex(/^[a-z][a-z0-9_]{3,80}$/),
  challengeType: challengeTypeSchema,
  outcome: challengeOutcomeSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  evidenceIds: z.array(evidenceIdSchema).min(1).max(12),
  explanation: z.string().trim().min(1).max(400),
  establishes: z.string().trim().min(1).max(240),
  remainsUnknown: z.string().trim().min(1).max(240),
  completedAtTick: tickSchema,
});

export type ChallengeType = z.infer<typeof challengeTypeSchema>;
export type ChallengeResult = z.infer<typeof challengeResultSchema>;
