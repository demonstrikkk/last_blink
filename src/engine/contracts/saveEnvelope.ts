import { z } from 'zod';
import {
  contractVersionSchema,
  gameVersionSchema,
  isoTimestampSchema,
  saveIdSchema,
  sessionIdSchema,
} from './primitives.js';
import { gameStateSchema } from './gameState.js';

export const SAVE_FORMAT_VERSION = 1;

/**
 * Versioned save. `checksum` is FNV-1a over the canonical JSON of every other
 * field except the checksum itself, and `engineStateHash` is the engine snapshot
 * hash of `payload`. Restore verifies both before accepting a save.
 */
export const saveEnvelopeSchema = z
  .strictObject({
    schemaVersion: contractVersionSchema,
    saveFormatVersion: z.literal(SAVE_FORMAT_VERSION),
    saveId: saveIdSchema,
    gameVersion: gameVersionSchema,
    sessionId: sessionIdSchema,
    savedAt: isoTimestampSchema,
    engineStateHash: z.string().regex(/^[0-9a-f]{16}$/),
    contractVersions: z.record(z.string().min(1).max(64), contractVersionSchema),
    payload: gameStateSchema,
    checksum: z.string().regex(/^[0-9a-f]{16}$/),
  })
  .refine((save) => save.payload.sessionId === save.sessionId, {
    message: 'payload session must match envelope session',
    path: ['payload', 'sessionId'],
  });

export type SaveEnvelope = z.infer<typeof saveEnvelopeSchema>;
