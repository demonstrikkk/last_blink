import { z } from 'zod';
import {
  branchIdSchema,
  contractVersionSchema,
  hashSchema,
  npcIdSchema,
  sessionIdSchema,
  stateVersionSchema,
  tickSchema,
} from './primitives.js';
import { factSchema } from './fact.js';

/**
 * Time-loop contracts (08:00 -> 18:00).
 *
 * The canonical clock is the existing `tick`: tick 0 is 08:00 and tick 600 is
 * 18:00. Keeping time in `tick` means every save, fork and observation that
 * already understands ticks understands the clock too. These schemas add only
 * the loop identity, the catastrophe ledger and MORROW's per-loop plan.
 */

/** The hard ceiling on minds MORROW may touch in one timeline. */
export const MAX_MORROW_TARGETS = 3;

/**
 * Tick 0 is 08:00. Tick 600 is the 18:00 catastrophe deadline. Keeping the
 * clock in `tick` means saves, observations and forks already carry it.
 */
export const CLOCK_START_MINUTE = 8 * 60;
export const CLOCK_DEADLINE_MINUTE = 18 * 60;
export const DEADLINE_TICK = CLOCK_DEADLINE_MINUTE - CLOCK_START_MINUTE;

export const MORROW_INTERFERENCE_TYPES = [
  'altered_recollection',
  'skewed_timestamp',
  'suppressed_confidence',
  'misattributed_detail',
  'sequence_confusion',
  'seeded_rumour',
  'temporary_blank',
] as const;

export const morrowInterferenceSchema = z.enum(MORROW_INTERFERENCE_TYPES);

export const MORROW_TACTICS = [
  'discredit_witness',
  'redirect_attention',
  'seed_rumour',
  'erase_detail',
  'reinforce_confidence',
] as const;

export const morrowTacticSchema = z.enum(MORROW_TACTICS);

export const morrowProviderSchema = z.enum(['deterministic', 'groq', 'gemini']);

/**
 * One influenced person. An interference only ever changes testimony or
 * perception; it never carries a fact key, value or canonical record.
 */
export const morrowTargetSchema = z.strictObject({
  npcId: npcIdSchema,
  interference: morrowInterferenceSchema,
  durationMinutes: z.number().int().min(30).max(600),
  /** The claim MORROW is trying to destabilise, if it has one in mind. */
  focusEvidenceId: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,60}$/)
    .nullable(),
});

export const morrowPlanSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  planId: z.string().regex(/^plan_[a-z0-9_]{3,60}$/),
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  loopIndex: z.number().int().min(1),
  tactic: morrowTacticSchema,
  targets: z.array(morrowTargetSchema).min(1).max(MAX_MORROW_TARGETS),
  rationale: z.string().trim().min(1).max(280),
  predictedFocus: z
    .array(z.string().regex(/^[a-z][a-z0-9_]{1,60}$/))
    .max(4),
  createdAtTick: tickSchema,
  provider: morrowProviderSchema.default('deterministic'),
});

export type MorrowPlan = z.infer<typeof morrowPlanSchema>;
export type MorrowTarget = z.infer<typeof morrowTargetSchema>;
export type MorrowTactic = z.infer<typeof morrowTacticSchema>;
export type MorrowInterference = z.infer<typeof morrowInterferenceSchema>;

/**
 * The loop a branch belongs to. `checkpointFacts` is the exact set of facts the
 * day starts with, so a reset can restore 08:00 without replaying a branch or
 * relying on retained runtime history (which a save/reload does not preserve).
 */
export const loopStateSchema = z.strictObject({
  index: z.number().int().min(1).default(1),
  resetCount: z.number().int().nonnegative().default(0),
  startTick: tickSchema.default(0),
  checkpointFacts: z.array(factSchema).max(64).default([]),
});

export const catastropheStatusSchema = z.enum(['pending', 'occurred', 'averted']);

export const catastropheStateSchema = z.strictObject({
  status: catastropheStatusSchema.default('pending'),
  occurredAtTick: tickSchema.nullable().default(null),
  avertedAtTick: tickSchema.nullable().default(null),
  cause: z.string().trim().max(280).nullable().default(null),
  missing: z.array(z.string().trim().max(80)).max(8).default([]),
  sequence: z.array(z.string().trim().max(160)).max(8).default([]),
});

export type LoopState = z.infer<typeof loopStateSchema>;
export type CatastropheState = z.infer<typeof catastropheStateSchema>;
export type CatastropheStatus = z.infer<typeof catastropheStatusSchema>;

/** The loop-start checkpoint carried by `loop.started`. */
export const loopCheckpointSchema = z.strictObject({
  previousLoopIndex: z.number().int().min(1),
  loopIndex: z.number().int().min(1),
  startTick: tickSchema,
  checkpointFacts: z.array(factSchema).min(1).max(64),
  checkpointStateVersion: stateVersionSchema,
  checkpointHash: hashSchema,
});

export type LoopCheckpoint = z.infer<typeof loopCheckpointSchema>;
