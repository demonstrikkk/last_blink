import { z } from 'zod';
import {
  actionIdSchema,
  actionTypeSchema,
  actorIdSchema,
  branchIdSchema,
  contractVersionSchema,
  eventIdSchema,
  isoTimestampSchema,
  jsonObjectSchema,
  proposalIdSchema,
  sessionIdSchema,
  sourceIdSchema,
  stateVersionSchema,
  tickSchema,
} from './primitives.js';

export const rejectionSchema = z.strictObject({
  code: z.enum([
    'invalid_action',
    'unknown_action',
    'policy_denied',
    'stale_state',
    'unknown_target',
    'duplicate',
    'deadline_passed',
    'engine_error',
  ]),
  message: z.string().trim().min(1).max(280),
  details: jsonObjectSchema,
});

export const actionResultSchema = z
  .strictObject({
    schemaVersion: contractVersionSchema,
    actionId: actionIdSchema,
    sessionId: sessionIdSchema,
    branchId: branchIdSchema,
    actorId: actorIdSchema,
    sourceId: sourceIdSchema,
    actionType: actionTypeSchema,
    proposalId: proposalIdSchema.nullable(),
    status: z.enum(['accepted', 'rejected']),
    tick: tickSchema,
    stateVersion: stateVersionSchema,
    eventIds: z.array(eventIdSchema).max(16),
    rejection: rejectionSchema.nullable(),
    resultingStateHash: z.string().regex(/^[0-9a-f]{16}$/),
    createdAt: isoTimestampSchema,
  })
  .refine(
    (result) =>
      result.status === 'accepted' ? result.rejection === null : result.rejection !== null,
    {
      message: 'accepted results carry no rejection; rejected results must carry one',
      path: ['rejection'],
    },
  );

export type ActionResult = z.infer<typeof actionResultSchema>;
export type Rejection = z.infer<typeof rejectionSchema>;
