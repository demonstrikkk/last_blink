import { z } from 'zod';
import {
  anchorIdSchema,
  branchIdSchema,
  contractVersionSchema,
  eventIdSchema,
  isoTimestampSchema,
  labelSchema,
  sessionIdSchema,
  stateVersionSchema,
  tickSchema,
} from './primitives.js';

/**
 * An anchor is a signed checkpoint that BLINK may return to. `stateHash` is the
 * hash of the state *before* the anchor.recorded event, because the anchor is
 * stored inside that state. `stateVersion` is the version of that same state.
 */
export const anchorSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  anchorId: anchorIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  label: labelSchema,
  tick: tickSchema,
  stateVersion: stateVersionSchema,
  stateHash: z.string().regex(/^[0-9a-f]{16}$/),
  eventSequenceNo: z.number().int().nonnegative(),
  /** Safe anchors survive a BLINK without collapsing the timeline. */
  safe: z.boolean(),
  sourceEventId: eventIdSchema,
  createdAt: isoTimestampSchema,
});

export type Anchor = z.infer<typeof anchorSchema>;
