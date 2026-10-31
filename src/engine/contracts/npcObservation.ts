import { z } from 'zod';
import {
  branchIdSchema,
  confidenceSchema,
  contractVersionSchema,
  eventIdSchema,
  factIdSchema,
  factKeySchema,
  isoTimestampSchema,
  jsonValueSchema,
  manifestIdSchema,
  npcIdSchema,
  observationIdSchema,
  sessionIdSchema,
  stateVersionSchema,
  tickSchema,
} from './primitives.js';

export const observedFactSchema = z.strictObject({
  factId: factIdSchema,
  key: factKeySchema,
  value: jsonValueSchema,
  confidence: confidenceSchema,
});

/**
 * Exactly what an NPC is allowed to know at one tick. The runtime filters by
 * NpcDefinition.permissions before constructing this; the schema cannot express
 * per-NPC policy on its own, the cognition runtime must.
 */
export const npcObservationSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  observationId: observationIdSchema,
  npcId: npcIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  tick: tickSchema,
  stateVersion: stateVersionSchema,
  visibleFacts: z.array(observedFactSchema).max(200),
  recentEventIds: z.array(eventIdSchema).max(32),
  /** Hash of the canonical observation payload, for replay comparison. */
  perceptionHash: z.string().regex(/^[0-9a-f]{16}$/),
  modelManifestId: manifestIdSchema.nullable(),
  createdAt: isoTimestampSchema,
});

export type NpcObservation = z.infer<typeof npcObservationSchema>;
export type ObservedFact = z.infer<typeof observedFactSchema>;
