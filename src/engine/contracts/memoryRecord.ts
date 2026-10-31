import { z } from 'zod';
import {
  branchIdSchema,
  contractVersionSchema,
  eventIdSchema,
  memoryIdSchema,
  npcIdSchema,
  sessionIdSchema,
  tickSchema,
  confidenceSchema,
  manifestIdSchema,
} from './primitives.js';

/**
 * Character memory with provenance. A memory without a source event is not
 * admissible: this is what stops the NPC runtime from inventing history.
 */
export const memoryRecordSchema = z
  .strictObject({
    schemaVersion: contractVersionSchema,
    memoryId: memoryIdSchema,
    npcId: npcIdSchema,
    sessionId: sessionIdSchema,
    branchId: branchIdSchema,
    kind: z.enum(['episodic', 'semantic', 'preference']),
    content: z.string().trim().min(1).max(2000),
    provenance: z.strictObject({
      sourceEventIds: z.array(eventIdSchema).min(1).max(32),
      sourceMemoryIds: z.array(memoryIdSchema).max(16),
    }),
    createdAtTick: tickSchema,
    importance: confidenceSchema,
    expiresAtTick: tickSchema.nullable(),
    visibility: z.enum(['private', 'shared']),
    modelManifestId: manifestIdSchema.nullable(),
    tags: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).max(8),
  })
  .refine(
    (memory) => memory.expiresAtTick === null || memory.expiresAtTick > memory.createdAtTick,
    { message: 'memory expiry must be after creation', path: ['expiresAtTick'] },
  );

export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
