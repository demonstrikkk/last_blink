import { z } from 'zod';
import {
  confidenceSchema,
  contractVersionSchema,
  factKeySchema,
  gameVersionSchema,
  jsonValueSchema,
  npcIdSchema,
  ruleSchema,
} from '../contracts/index.js';

export const initialFactSchema = z.strictObject({
  key: factKeySchema,
  value: jsonValueSchema,
  kind: z.enum(['observed', 'asserted']),
  sourceRef: z.string().trim().min(1).max(160),
});

const definitionIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,60}$/);

/**
 * An evidence item the player can collect. Content owns the mapping from a
 * stable evidence id to a canonical `evidence.*` fact, so untrusted action
 * parameters can never invent a fact (ADR 0008).
 */
export const evidenceDefinitionSchema = z.strictObject({
  evidenceId: definitionIdSchema,
  factKey: factKeySchema.refine((key) => key.startsWith('evidence.'), {
    message: 'evidence facts must live under the evidence. namespace',
  }),
  label: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(400),
  value: jsonValueSchema,
  sourceRef: z.string().trim().min(1).max(160),
  sourceKind: z.enum(['record', 'testimony', 'asset']).default('record'),
  confidence: confidenceSchema,
  /**
   * Who said it, when the evidence is testimony. MORROW can shape what a
   * speaker remembers, so the collector needs to know whose account this is.
   */
  speakerNpcId: npcIdSchema.nullable().default(null),
  /**
   * Fact keys that must already exist before this evidence can be collected.
   * Additive Stage 5 field: action callers still only name the evidence id.
   */
  requires: z.array(factKeySchema).max(8).default([]),
});

export const choiceEffectSchema = z.strictObject({
  key: factKeySchema,
  value: jsonValueSchema,
});

export const choiceOptionSchema = z.strictObject({
  optionId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1).max(60),
  detail: z.string().trim().min(1).max(200),
  /** Canonical facts this option writes when the choice is committed. */
  effects: z.array(choiceEffectSchema).min(1).max(4),
  /** Fact keys this decision is expected to influence (stored on Choice). */
  consequenceKeys: z.array(factKeySchema).min(1).max(8),
});

export const choiceNodeSchema = z.strictObject({
  nodeId: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/),
  prompt: z.string().trim().min(1).max(280),
  /**
   * Fact keys that must already exist before this decision can be committed.
   * The Stage 5 Sable node requires `evidence.relay_7`; the ward call requires
   * both earlier decisions. Enforced by the engine, not by the UI.
   */
  requires: z.array(factKeySchema).max(8).default([]),
  options: z.array(choiceOptionSchema).min(2).max(4),
});

/** A story objective, satisfied when every required fact key exists. */
export const objectiveDefinitionSchema = z.strictObject({
  objectiveId: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/),
  label: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(280),
  requires: z.array(factKeySchema).min(1).max(8),
  /**
   * Optional objectives are bonus investigation tracks. They never hold the
   * "current objective" pointer and never block a ward ending.
   */
  optional: z.boolean().default(false),
});

/** Presentation metadata for a rule-owned ending. */
export const endingDefinitionSchema = z.strictObject({
  endingId: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(400),
});

export const gameContentSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  contentId: z.string().trim().min(1).max(80),
  gameVersion: gameVersionSchema,
  initialFacts: z.array(initialFactSchema).max(64),
  rules: z.array(ruleSchema).max(128),
  evidence: z.array(evidenceDefinitionSchema).max(16).default([]),
  choices: z.array(choiceNodeSchema).max(16).default([]),
  objectives: z.array(objectiveDefinitionSchema).max(24).default([]),
  endings: z.array(endingDefinitionSchema).max(8).default([]),
});

export type GameContent = z.infer<typeof gameContentSchema>;
export type InitialFact = z.infer<typeof initialFactSchema>;
export type EvidenceDefinition = z.infer<typeof evidenceDefinitionSchema>;
export type ChoiceNode = z.infer<typeof choiceNodeSchema>;
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;
export type ObjectiveDefinition = z.infer<typeof objectiveDefinitionSchema>;
export type EndingDefinition = z.infer<typeof endingDefinitionSchema>;

/**
 * Stage 3 scaffold content. It exists to exercise rules, facts and anchors in
 * tests; Stage 4 ships STAGE4_CONTENT from `src/content/`.
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
  evidence: [],
  choices: [],
});
