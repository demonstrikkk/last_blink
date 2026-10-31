import { z } from 'zod';
import {
  contractVersionSchema,
  isoTimestampSchema,
  manifestIdSchema,
  versionSchema,
} from './primitives.js';

export const policyKindSchema = z.enum(['scripted', 'llm', 'ppo_onnx', 'morrow']);

/**
 * Provenance for any policy that can propose actions or dialogue. A model
 * manifest never grants authority: the engine still validates every proposal.
 */
export const modelManifestSchema = z
  .strictObject({
    schemaVersion: contractVersionSchema,
    manifestId: manifestIdSchema,
    policyId: z.string().regex(/^[a-z][a-z0-9_.-]{1,60}$/),
    policyKind: policyKindSchema,
    version: versionSchema,
    provider: z.string().trim().min(1).max(60),
    modelId: z.string().trim().min(1).max(120).nullable(),
    promptVersion: z.string().trim().min(1).max(40).nullable(),
    seed: z.number().int().safe().nullable(),
    deterministic: z.boolean(),
    capabilities: z.array(z.string().trim().min(1).max(60)).max(16),
    createdAt: isoTimestampSchema,
    notes: z.string().trim().max(400).nullable(),
  })
  .refine(
    (manifest) =>
      manifest.policyKind === 'scripted' || manifest.policyKind === 'ppo_onnx'
        ? manifest.deterministic
        : true,
    {
      message: 'scripted and ppo_onnx policies must be declared deterministic',
      path: ['deterministic'],
    },
  )
  .refine((manifest) => manifest.policyKind !== 'llm' || manifest.modelId !== null, {
    message: 'llm policies must name a model',
    path: ['modelId'],
  });

export type ModelManifest = z.infer<typeof modelManifestSchema>;
export type PolicyKind = z.infer<typeof policyKindSchema>;
