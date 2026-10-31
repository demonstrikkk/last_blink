import type { z } from 'zod';
import { CONTRACT_NAMES, type ContractName } from './contractNames.js';
import { CONTRACT_VERSION } from './primitives.js';
import { gameEventSchema } from './gameEvent.js';
import { gameStateSchema } from './gameState.js';
import { factSchema } from './fact.js';
import { choiceSchema } from './choice.js';
import { ruleSchema } from './rule.js';
import { anchorSchema } from './anchor.js';
import { branchSchema } from './branch.js';
import { npcDefinitionSchema } from './npcDefinition.js';
import { npcObservationSchema } from './npcObservation.js';
import { npcDecisionProposalSchema } from './npcDecisionProposal.js';
import { actionResultSchema } from './actionResult.js';
import { saveEnvelopeSchema } from './saveEnvelope.js';
import { playerProfileSchema } from './playerProfile.js';
import { memoryRecordSchema } from './memoryRecord.js';
import { modelManifestSchema } from './modelManifest.js';
import { contractFixtures } from './fixtures.js';

export type ContractOwner = 'engine' | 'narrative' | 'ai-runtime' | 'persistence' | 'platform';

export interface ContractDescriptor {
  name: ContractName;
  version: string;
  owner: ContractOwner;
  summary: string;
  schema: z.ZodType;
  fixtures: { valid: object; invalid: object };
}

function descriptor(
  name: ContractName,
  owner: ContractOwner,
  summary: string,
  schema: z.ZodType,
): ContractDescriptor {
  return {
    name,
    version: CONTRACT_VERSION,
    owner,
    summary,
    schema,
    fixtures: contractFixtures[name],
  };
}

/**
 * The single list of frozen contracts. Adding a contract means adding it here,
 * to CONTRACT_NAMES and to docs/CONTRACT_CATALOGUE.md in the same change.
 */
export const CONTRACT_REGISTRY: Record<ContractName, ContractDescriptor> = {
  GameEvent: descriptor(
    'GameEvent',
    'engine',
    'A validated, immutable fact about something that happened in the world.',
    gameEventSchema,
  ),
  GameState: descriptor(
    'GameState',
    'engine',
    'Canonical branch-scoped world state produced only by applying events.',
    gameStateSchema,
  ),
  Fact: descriptor('Fact', 'engine', 'A namespaced world truth with source provenance.', factSchema),
  Choice: descriptor('Choice', 'narrative', 'A committed player decision at a narrative node.', choiceSchema),
  Rule: descriptor('Rule', 'engine', 'A deterministic condition/effect pair over facts.', ruleSchema),
  Anchor: descriptor('Anchor', 'engine', 'A BLINK checkpoint with a hashed state.', anchorSchema),
  Branch: descriptor('Branch', 'engine', 'A timeline and its ancestry.', branchSchema),
  NpcDefinition: descriptor(
    'NpcDefinition',
    'ai-runtime',
    'NPC identity, goals and the permissions that bound its cognition.',
    npcDefinitionSchema,
  ),
  NpcObservation: descriptor(
    'NpcObservation',
    'ai-runtime',
    'The filtered world view an NPC is allowed to perceive at one tick.',
    npcObservationSchema,
  ),
  NpcDecisionProposal: descriptor(
    'NpcDecisionProposal',
    'ai-runtime',
    'Untrusted proposed actions that the engine must validate.',
    npcDecisionProposalSchema,
  ),
  ActionResult: descriptor(
    'ActionResult',
    'engine',
    'Accepted or rejected action with the events it produced.',
    actionResultSchema,
  ),
  SaveEnvelope: descriptor(
    'SaveEnvelope',
    'persistence',
    'Versioned, checksummed save data suitable for local or YSQL storage.',
    saveEnvelopeSchema,
  ),
  PlayerProfile: descriptor(
    'PlayerProfile',
    'narrative',
    'Player identity, consent and coarse behavioural signals.',
    playerProfileSchema,
  ),
  MemoryRecord: descriptor(
    'MemoryRecord',
    'ai-runtime',
    'NPC memory with mandatory event provenance and expiry.',
    memoryRecordSchema,
  ),
  ModelManifest: descriptor(
    'ModelManifest',
    'platform',
    'Policy/model version, seed and capability metadata.',
    modelManifestSchema,
  ),
};

export const CONTRACT_VERSIONS: Record<ContractName, typeof CONTRACT_VERSION> = Object.fromEntries(
  CONTRACT_NAMES.map((name) => [name, CONTRACT_REGISTRY[name].version as typeof CONTRACT_VERSION]),
) as Record<ContractName, typeof CONTRACT_VERSION>;

export function listContracts(): readonly ContractDescriptor[] {
  return CONTRACT_NAMES.map((name) => CONTRACT_REGISTRY[name]);
}

export function parseContract<T>(name: ContractName, value: unknown): T {
  return CONTRACT_REGISTRY[name].schema.parse(value) as T;
}

export function safeParseContract(name: ContractName, value: unknown) {
  return CONTRACT_REGISTRY[name].schema.safeParse(value);
}
