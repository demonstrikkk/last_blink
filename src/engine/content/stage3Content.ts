import { z } from 'zod';
import {
  contractVersionSchema,
  factKeySchema,
  gameVersionSchema,
  jsonValueSchema,
  ruleSchema,
} from '../contracts/index.js';

export const initialFactSchema = z.strictObject({
  key: factKeySchema,
  value: jsonValueSchema,
  kind: z.enum(['observed', 'asserted']),
  sourceRef: z.string().trim().min(1).max(160),
});

export const gameContentSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  contentId: z.string().trim().min(1).max(80),
  gameVersion: gameVersionSchema,
  initialFacts: z.array(initialFactSchema).max(64),
  rules: z.array(ruleSchema).max(128),
});

export type GameContent = z.infer<typeof gameContentSchema>;
export type InitialFact = z.infer<typeof initialFactSchema>;

/**
 * Stage 3 scaffold content. It exists to exercise rules, facts and anchors in
 * tests; it is not story content and must be replaced in Stage 5.
 */
export const STAGE3_CONTENT: GameContent = gameContentSchema.parse({
  schemaVersion: '1.0.0',
  contentId: 'content.stage3.scaffold',
  gameVersion: '0.1.0',
  initialFacts: [
    {
      key: 'debug.counter',
      value: 0,
      kind: 'asserted',
      sourceRef: 'content.stage3.seed',
    },
  ],
  rules: [
    {
      schemaVersion: '1.0.0',
      ruleId: 'rul_scaffold_threshold',
      description: 'Scaffold rule: set debug.flag once the counter reaches two.',
      priority: 10,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'debug.counter', op: 'gte', value: 2 },
          { kind: 'not', of: { kind: 'fact', key: 'debug.flag', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'debug.flag',
          value: true,
          confidence: 1,
          sourceRef: 'rule.rul_scaffold_threshold',
        },
      ],
    },
  ],
});
