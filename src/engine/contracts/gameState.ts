import { z } from 'zod';
import {
  branchIdSchema,
  contractVersionSchema,
  eventIdSchema,
  gameVersionSchema,
  sessionIdSchema,
  stateVersionSchema,
  tickSchema,
} from './primitives.js';
import { factSchema } from './fact.js';
import { choiceSchema } from './choice.js';
import { anchorSchema } from './anchor.js';
import { branchSchema } from './branch.js';
import { playerProfileSchema } from './playerProfile.js';
import { caseLinkSchema, caseHypothesisSchema } from './caseBoard.js';
import { challengeResultSchema } from './challenge.js';

/**
 * Canonical, branch-scoped world state. Everything here is derived by applying
 * validated events; no renderer, model or database writes directly into it.
 */
export const gameStateSchema = z
  .strictObject({
    schemaVersion: contractVersionSchema,
    sessionId: sessionIdSchema,
    branchId: branchIdSchema,
    stateVersion: stateVersionSchema,
    tick: tickSchema,
    contentId: z.string().trim().min(1).max(80),
    gameVersion: gameVersionSchema,
    seed: z.string().min(1).max(80),
    facts: z.record(z.string(), factSchema),
    choices: z.array(choiceSchema).max(512),
    caseLinks: z.array(caseLinkSchema).max(512),
    hypotheses: z.array(caseHypothesisSchema).max(128),
    challengeResults: z.array(challengeResultSchema).max(64),
    anchors: z.array(anchorSchema).max(256),
    /** Lineage including the current branch. */
    branches: z.array(branchSchema).min(1).max(64),
    player: playerProfileSchema,
    endingId: z.string().trim().min(1).max(64).nullable(),
    lastEventId: eventIdSchema.nullable(),
    /** Deterministic PRNG position; advanced only by engine code. */
    rngCursor: z.number().int().nonnegative(),
  })
  .superRefine((state, ctx) => {
    if (!state.branches.some((branch) => branch.branchId === state.branchId)) {
      ctx.addIssue({ code: 'custom', message: 'current branch must exist in branches' });
    }
    if (state.stateVersion === 0 && state.lastEventId !== null) {
      ctx.addIssue({ code: 'custom', message: 'version 0 state cannot have a last event' });
    }
    for (const [key, fact] of Object.entries(state.facts)) {
      if (fact.key !== key) {
        ctx.addIssue({ code: 'custom', message: `fact map key ${key} does not match fact.key` });
      }
      if (fact.branchId !== state.branchId) {
        ctx.addIssue({ code: 'custom', message: `fact ${key} belongs to another branch` });
      }
      if (fact.acquiredAtTick > state.tick) {
        ctx.addIssue({ code: 'custom', message: `fact ${key} was acquired in the future` });
      }
    }
    for (const choice of state.choices) {
      if (choice.branchId !== state.branchId || choice.sessionId !== state.sessionId) {
        ctx.addIssue({ code: 'custom', message: `choice ${choice.choiceId} is out of scope` });
      }
    }
    for (const link of state.caseLinks) {
      if (link.branchId !== state.branchId || link.sessionId !== state.sessionId) {
        ctx.addIssue({ code: 'custom', message: `case link ${link.linkId} is out of scope` });
      }
    }
    for (const hypothesis of state.hypotheses) {
      if (hypothesis.branchId !== state.branchId || hypothesis.sessionId !== state.sessionId) {
        ctx.addIssue({ code: 'custom', message: `hypothesis ${hypothesis.hypothesisId} is out of scope` });
      }
    }
    for (const result of state.challengeResults) {
      if (result.branchId !== state.branchId || result.sessionId !== state.sessionId) {
        ctx.addIssue({ code: 'custom', message: `challenge result ${result.challengeId} is out of scope` });
      }
    }
    for (const anchor of state.anchors) {
      if (anchor.branchId !== state.branchId || anchor.sessionId !== state.sessionId) {
        ctx.addIssue({ code: 'custom', message: `anchor ${anchor.anchorId} is out of scope` });
      }
    }
  });

export type GameState = z.infer<typeof gameStateSchema>;
