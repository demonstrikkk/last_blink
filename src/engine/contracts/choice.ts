import { z } from 'zod';
import {
  choiceIdSchema,
  contractVersionSchema,
  eventIdSchema,
  sessionIdSchema,
  branchIdSchema,
  tickSchema,
} from './primitives.js';

/** A committed player decision at a narrative node. */
export const choiceSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  choiceId: choiceIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  nodeId: z.string().trim().min(1).max(64),
  optionId: z.string().trim().min(1).max(64),
  madeAtTick: tickSchema,
  sourceEventId: eventIdSchema,
  /** Fact keys this decision is expected to influence. */
  consequenceKeys: z.array(z.string().trim().min(1).max(160)).max(32),
});

export type Choice = z.infer<typeof choiceSchema>;
