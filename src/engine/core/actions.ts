import { z } from 'zod';
import {
  actionTypeSchema,
  actorIdSchema,
  anchorIdSchema,
  factKeySchema,
  jsonObjectSchema,
  jsonValueSchema,
  labelSchema,
} from '../contracts/primitives.js';

/** The untrusted shape a caller may submit to GameSession.dispatch. */
export const gameActionSchema = z.strictObject({
  actionType: actionTypeSchema,
  actorId: actorIdSchema,
  params: jsonObjectSchema.default({}),
});

export type GameAction = z.infer<typeof gameActionSchema>;

export const advanceTickParamsSchema = z.strictObject({
  ticks: z.number().int().min(1).max(10).default(1),
});

export const factAssertParamsSchema = z.strictObject({
  key: factKeySchema,
  value: jsonValueSchema,
  kind: z.enum(['observed', 'asserted']).default('asserted'),
  sourceRef: z.string().trim().min(1).max(160).default('debug.action'),
});

export const anchorParamsSchema = z.strictObject({
  label: labelSchema,
});

export const forkParamsSchema = z.strictObject({
  anchorId: anchorIdSchema,
  label: labelSchema.default('Forked timeline'),
});

export const noopParamsSchema = z.strictObject({});

/** Names a content-defined evidence item; never carries a fact key or value. */
export const evidenceCollectParamsSchema = z.strictObject({
  evidenceId: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/),
});

/** Names a content-defined choice node and option. */
export const choiceMakeParamsSchema = z.strictObject({
  nodeId: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/),
  optionId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
});

export type ParsedAction =
  | { actionType: 'session.noop'; actorId: z.infer<typeof actorIdSchema>; params: Record<string, never> }
  | {
      actionType: 'session.advance_tick';
      actorId: z.infer<typeof actorIdSchema>;
      params: z.infer<typeof advanceTickParamsSchema>;
    }
  | {
      actionType: 'fact.assert';
      actorId: z.infer<typeof actorIdSchema>;
      params: z.infer<typeof factAssertParamsSchema>;
    }
  | {
      actionType: 'anchor.record';
      actorId: z.infer<typeof actorIdSchema>;
      params: z.infer<typeof anchorParamsSchema>;
    }
  | {
      actionType: 'branch.fork';
      actorId: z.infer<typeof actorIdSchema>;
      params: z.infer<typeof forkParamsSchema>;
    }
  | {
      actionType: 'evidence.collect';
      actorId: z.infer<typeof actorIdSchema>;
      params: z.infer<typeof evidenceCollectParamsSchema>;
    }
  | {
      actionType: 'choice.make';
      actorId: z.infer<typeof actorIdSchema>;
      params: z.infer<typeof choiceMakeParamsSchema>;
    };
