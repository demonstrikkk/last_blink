import { z } from 'zod';
import {
  confidenceSchema,
  contractVersionSchema,
  factKeySchema,
  jsonValueSchema,
  ruleIdSchema,
} from './primitives.js';

export const factOperatorSchema = z.enum(['eq', 'neq', 'gte', 'lte', 'in', 'exists']);

export type Condition =
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] }
  | { kind: 'not'; of: Condition }
  | {
      kind: 'fact';
      key: z.infer<typeof factKeySchema>;
      op: z.infer<typeof factOperatorSchema>;
      value?: z.infer<typeof jsonValueSchema>;
    };

/**
 * Conditions are a closed, JSON-serialisable tree. No arbitrary code, no
 * closures: a rule set can be hashed, stored and replayed exactly.
 */
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('all'),
      of: z.array(conditionSchema).min(1).max(16),
    }),
    z.strictObject({
      kind: z.literal('any'),
      of: z.array(conditionSchema).min(1).max(16),
    }),
    z.strictObject({ kind: z.literal('not'), of: conditionSchema }),
    z
      .strictObject({
        kind: z.literal('fact'),
        key: factKeySchema,
        op: factOperatorSchema,
        value: jsonValueSchema.optional(),
      })
      .refine((condition) => (condition.op === 'exists') === (condition.value === undefined), {
        message: '`exists` takes no value and every other operator requires one',
        path: ['value'],
      }),
  ]),
);

export type RuleEffect =
  | {
      kind: 'assert_fact';
      key: z.infer<typeof factKeySchema>;
      value: z.infer<typeof jsonValueSchema>;
      confidence: number;
      sourceRef: string;
    }
  | { kind: 'set_ending'; endingId: string };

export const ruleEffectSchema: z.ZodType<RuleEffect> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('assert_fact'),
    key: factKeySchema,
    value: jsonValueSchema,
    confidence: confidenceSchema,
    sourceRef: z.string().trim().min(1).max(160),
  }),
  z.strictObject({
    kind: z.literal('set_ending'),
    endingId: z.string().trim().min(1).max(64),
  }),
]);

export const ruleSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  ruleId: ruleIdSchema,
  description: z.string().trim().min(1).max(280),
  priority: z.number().int().min(-100).max(100),
  enabled: z.boolean(),
  condition: conditionSchema,
  effects: z.array(ruleEffectSchema).min(1).max(8),
});

export type Rule = z.infer<typeof ruleSchema>;
