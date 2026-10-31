import { z } from 'zod';
import {
  contractVersionSchema,
  isoTimestampSchema,
  playerIdSchema,
} from './primitives.js';

/**
 * Behavioural signals are coarse bands, not raw input logs. They exist so later
 * stages can adapt presentation without building a surveillance profile.
 */
export const behaviouralSignalsSchema = z.strictObject({
  explorationStyle: z.enum(['unknown', 'cautious', 'thorough', 'direct']),
  decisionLatencyBand: z.enum(['unknown', 'fast', 'measured', 'deliberate']),
});

export const playerProgressSchema = z.strictObject({
  choicesMade: z.number().int().nonnegative(),
  evidenceFound: z.number().int().nonnegative(),
  anchorsReached: z.number().int().nonnegative(),
});

export const playerProfileSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  playerId: playerIdSchema,
  displayName: z.string().trim().min(1).max(40),
  createdAt: isoTimestampSchema,
  consent: z.strictObject({
    telemetry: z.boolean(),
    npcMemory: z.boolean(),
  }),
  behaviouralSignals: behaviouralSignalsSchema,
  progress: playerProgressSchema,
});

export type PlayerProfile = z.infer<typeof playerProfileSchema>;
