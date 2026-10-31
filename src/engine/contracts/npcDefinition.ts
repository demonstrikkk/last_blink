import { z } from 'zod';
import {
  contractVersionSchema,
  manifestIdSchema,
  npcActionTypeSchema,
  npcIdSchema,
} from './primitives.js';

export const npcGoalSchema = z.strictObject({
  goalId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  description: z.string().trim().min(1).max(200),
  priority: z.number().int().min(1).max(5),
});

/**
 * What an NPC is and what it may do. `mayProposeOnly` is a literal `true` so no
 * content file can accidentally grant an NPC direct write access to state.
 */
export const npcDefinitionSchema = z.strictObject({
  schemaVersion: contractVersionSchema,
  npcId: npcIdSchema,
  displayName: z.string().trim().min(1).max(60),
  role: z.string().trim().min(1).max(80),
  goals: z.array(npcGoalSchema).min(1).max(5),
  /** Fact-key prefixes this NPC may ever perceive. */
  knowledgeScopes: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  permissions: z.strictObject({
    observableFactPrefixes: z.array(z.string().trim().min(1).max(80)).max(12),
    allowedActionTypes: z.array(npcActionTypeSchema).max(8),
    mayProposeOnly: z.literal(true),
  }),
  memoryNamespace: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  modelManifestId: manifestIdSchema.nullable(),
  voice: z.strictObject({
    register: z.enum(['neutral', 'clipped', 'warm', 'synthetic']),
    speechRate: z.number().min(0.5).max(2),
  }),
});

export type NpcDefinition = z.infer<typeof npcDefinitionSchema>;
export type NpcGoal = z.infer<typeof npcGoalSchema>;
