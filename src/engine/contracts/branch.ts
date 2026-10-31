import { z } from 'zod';
import {
  anchorIdSchema,
  branchIdSchema,
  contractVersionSchema,
  hashSchema,
  isoTimestampSchema,
  labelSchema,
  sessionIdSchema,
  tickSchema,
} from './primitives.js';

/**
 * A timeline. The first branch has no parent; BLINK forks create descendants.
 *
 * Stage 6 adds the checkpoint coordinates explicitly (ADR 0013). A fork always
 * starts at an anchor, so `forkedAt*` describes the checkpoint, not the moment
 * the fork action was dispatched: the parent may already be ahead of the
 * anchor when the player blinks back.
 */
export const branchSchema = z
  .strictObject({
    schemaVersion: contractVersionSchema,
    branchId: branchIdSchema,
    sessionId: sessionIdSchema,
    parentBranchId: branchIdSchema.nullable(),
    forkedAtAnchorId: anchorIdSchema.nullable(),
    /** State version of the checkpoint the child timeline starts from. */
    forkedAtTick: tickSchema.nullable(),
    forkedAtStateVersion: z.number().int().nonnegative().nullable(),
    /** Position of the anchor.recorded event in the parent's event log. */
    forkedAtEventSequenceNo: z.number().int().positive().nullable(),
    /** Canonical hash of the parent state at the checkpoint. */
    forkedAtStateHash: hashSchema.nullable(),
    label: labelSchema,
    status: z.enum(['active', 'archived']),
    timelineIndex: z.number().int().nonnegative(),
    createdAt: isoTimestampSchema,
  })
  .refine(
    (branch) =>
      branch.parentBranchId === null
        ? branch.forkedAtAnchorId === null &&
          branch.forkedAtTick === null &&
          branch.forkedAtStateVersion === null &&
          branch.forkedAtEventSequenceNo === null &&
          branch.forkedAtStateHash === null
        : branch.forkedAtAnchorId !== null &&
          branch.forkedAtTick !== null &&
          branch.forkedAtStateVersion !== null &&
          branch.forkedAtEventSequenceNo !== null &&
          branch.forkedAtStateHash !== null,
    {
      message: 'root branches have no fork metadata; child branches require all of it',
      path: ['forkedAtAnchorId'],
    },
  );

export type Branch = z.infer<typeof branchSchema>;
