import { z } from 'zod';
import {
  branchIdSchema,
  confidenceSchema,
  contractVersionSchema,
  eventIdSchema,
  factIdSchema,
  factKeySchema,
  jsonValueSchema,
  tickSchema,
} from './primitives.js';

/**
 * Where a fact came from. `asset` refers to a curated file in public/assets,
 * `record` to an in-world write-up, `testimony` to an NPC statement and
 * `derived` to rule evaluation.
 */export const factSourceSchema = z.strictObject({
  kind: z.enum(['asset', 'record', 'testimony', 'derived', 'system']),
  ref: z.string().trim().min(1).max(160),
});

export const factKindSchema = z.enum(['observed', 'asserted', 'derived']);

export const factSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  factId: factIdSchema,
  key: factKeySchema,
  value: jsonValueSchema,
  kind: factKindSchema,
  confidence: confidenceSchema,
  sourceEventId: eventIdSchema,
  branchId: branchIdSchema,
  acquiredAtTick: tickSchema,
  source: factSourceSchema,
});

export type Fact = z.infer<typeof factSchema>;
export type FactSource = z.infer<typeof factSourceSchema>;
