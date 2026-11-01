import { z } from 'zod';
import {
  branchIdSchema,
  confidenceSchema,
  contractVersionSchema,
  eventIdSchema,
  factIdSchema,
  factKeySchema,
  jsonValueSchema,
  npcIdSchema,
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
  /**
   * A testimony fact can carry the mark of shaped memory. It is deliberately a
   * quiet field, not a canonical verdict: it says the account was influenced,
   * never that the recorded value is false. Defaults keep old saves parseable.
   */
  contaminated: z.boolean().default(false),
  contaminationSource: npcIdSchema.nullable().default(null),
});

export type Fact = z.infer<typeof factSchema>;
export type FactSource = z.infer<typeof factSourceSchema>;
