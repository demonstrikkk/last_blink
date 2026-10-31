import {
  CONTRACT_VERSION,
  npcDefinitionSchema,
  type NpcDefinition,
  type NpcId,
} from '../engine/contracts/index.js';

export const SABLE = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_sable',
  displayName: 'Sable',
  role: 'Relay Street signal keeper',
  goals: [
    {
      goalId: 'protect_the_street',
      description: 'Keep Relay Street out of the ward record.',
      priority: 5,
    },
    {
      goalId: 'read_the_log',
      description: 'Understand the eight missing minutes before deciding.',
      priority: 4,
    },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.sable.', 'world.ward_alert'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.sable.', 'world.ward_alert'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'sable_relay',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 0.95 },
});

export const IVO = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_ivo',
  displayName: 'Ivo',
  role: 'Stall vendor and witness',
  goals: [
    {
      goalId: 'keep_the_stall',
      description: 'Keep the stall and avoid becoming a name in the ward record.',
      priority: 5,
    },
    {
      goalId: 'be_believed',
      description: 'Have his account treated as a real observation.',
      priority: 3,
    },
  ],
  knowledgeScopes: [
    'evidence.',
    'story.',
    'npc.ivo.',
    'world.vendor_confidence',
    'world.dispatch_continuity',
  ],
  permissions: {
    observableFactPrefixes: [
      'evidence.',
      'story.',
      'npc.ivo.',
      'world.vendor_confidence',
      'world.dispatch_continuity',
    ],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'ivo_stall',
  modelManifestId: null,
  voice: { register: 'warm', speechRate: 1.05 },
});

export const STAGE9_NPC_DEFINITIONS: Record<NpcId, NpcDefinition> = {
  [SABLE.npcId]: SABLE,
  [IVO.npcId]: IVO,
};

export const STAGE9_NPC_LIST: readonly NpcDefinition[] = [SABLE, IVO];
