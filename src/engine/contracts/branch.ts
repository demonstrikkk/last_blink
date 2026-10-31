import { z } from 'zod';
import {
  anchorIdSchema,
  branchIdSchema,
  contractVersionSchema,
  isoTimestampSchema,
  labelSchema,
  sessionIdSchema,
  tickSchema,
} from './primitives.js';

/** A timeline. The first branch has no parent; BLINK forks create descendants. */
export const branchSchema = z
  .strictObject({
    schemaVersion: contractVersionSchema,
    branchId: branchIdSchema,
    sessionId: sessionIdSchema,
    parentBranchId: branchIdSchema.nullable(),
    forkedAtAnchorId: anchorIdSchema.nullable(),
    forkedAtTick: tickSchema.nullable(),
    forkedAtStateVersion: z.number().int().nonnegative().nullable(),
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
          branch.forkedAtStateVersion === null
        : branch.forkedAtAnchorId !== null &&
          branch.forkedAtTick !== null &&
          branch.forkedAtStateVersion !== null,
    {
      message: 'root branches have no fork metadata; child branches require all of it',
      path: ['forkedAtAnchorId'],
    },
  );

export type Branch = z.infer<typeof branchSchema>;
