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

export const LYRA = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_lyra',
  displayName: 'Lyra',
  role: 'Nocturne Diner proprietor',
  goals: [
    {
      goalId: 'protect_patrons',
      description: 'Shield curfew violators drinking at the counter from MORROW sweeps.',
      priority: 5,
    },
    {
      goalId: 'verify_blackout',
      description: 'Confirm the exact time diner neon flickered out during the outage.',
      priority: 4,
    },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.lyra.', 'world.ward_alert'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.lyra.', 'world.ward_alert'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'lyra_diner',
  modelManifestId: null,
  voice: { register: 'warm', speechRate: 1.0 },
});

export const CASTOR = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_castor',
  displayName: 'Enforcer Castor',
  role: 'Ward Dispatch Enforcer',
  goals: [
    {
      goalId: 'enforce_curfew',
      description: 'Lock down the south freight line and seal transmission records.',
      priority: 5,
    },
    {
      goalId: 'follow_ward_directive',
      description: 'Obey MORROW automated security advisories without question.',
      priority: 4,
    },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.castor.', 'world.ward_alert'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.castor.', 'world.ward_alert'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'castor_dispatch',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 0.9 },
});

export const VANE = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_vane',
  displayName: 'Courier Vane',
  role: 'Intercepted Ward Courier',
  goals: [
    {
      goalId: 'recover_package',
      description: 'Deliver the intercepted optical data drive before the next tick.',
      priority: 5,
    },
    {
      goalId: 'evade_surveillance',
      description: 'Stay outside MORROW camera corridors along the freight yard.',
      priority: 4,
    },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.vane.', 'world.ward_alert'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.vane.', 'world.ward_alert'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'vane_courier',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 1.1 },
});

export const MARA = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_mara',
  displayName: 'Mara',
  role: 'Archive Keeper & Records Specialist',
  goals: [
    {
      goalId: 'preserve_integrity',
      description: 'Prevent falsification of archival municipal records.',
      priority: 5,
    },
    {
      goalId: 'verify_chronology',
      description: 'Authenticate discrepancy between raw hardware counter and civic record.',
      priority: 4,
    },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.mara.', 'world.archive'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.mara.', 'world.archive'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'mara_archive',
  modelManifestId: null,
  voice: { register: 'warm', speechRate: 0.95 },
});

export const REN = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_ren',
  displayName: 'Ren',
  role: 'Ward Dispatch Operator',
  goals: [
    {
      goalId: 'route_emergency_traffic',
      description: 'Uncover why emergency warnings were intentionally delayed.',
      priority: 5,
    },
    {
      goalId: 'expose_timing_gap',
      description: 'Prove the 03:14 dispatch runner was dispatched without an encrypted token.',
      priority: 4,
    },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.ren.', 'world.dispatch_continuity'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.ren.', 'world.dispatch_continuity'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'ren_dispatch',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 1.05 },
});

export const DIRECTOR_VALE = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_vale',
  displayName: 'Director Vale',
  role: 'Civic Authority Administrator',
  goals: [
    {
      goalId: 'prevent_public_panic',
      description: 'Maintain institutional stability and contain civic panic across Veyra.',
      priority: 5,
    },
    {
      goalId: 'justify_containment',
      description: 'Defend information restrictions as an operational necessity.',
      priority: 4,
    },
  ],
  knowledgeScopes: [
    'evidence.',
    'story.',
    'npc.vale.',
    'world.morrow_scrutiny',
    'world.ward_alert',
  ],
  permissions: {
    observableFactPrefixes: [
      'evidence.',
      'story.',
      'npc.vale.',
      'world.morrow_scrutiny',
      'world.ward_alert',
    ],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'vale_authority',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 0.88 },
});

export const NIA = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_nia',
  displayName: 'Nia',
  role: 'Affected Ward Resident',
  goals: [
    {
      goalId: 'secure_clinic_relief',
      description: 'Secure urgent medical deliveries delayed by the network hold.',
      priority: 5,
    },
    {
      goalId: 'demand_accountability',
      description: 'Confront the Ward desk over suppressed emergency warnings.',
      priority: 4,
    },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.nia.', 'world.ward_alert'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.nia.', 'world.ward_alert'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'nia_resident',
  modelManifestId: null,
  voice: { register: 'warm', speechRate: 1.0 },
});

export const STAGE9_NPC_DEFINITIONS: Record<NpcId, NpcDefinition> = {
  [SABLE.npcId]: SABLE,
  [IVO.npcId]: IVO,
};

export const STAGE9_NPC_LIST: readonly NpcDefinition[] = [SABLE, IVO];
export const EXPANDED_CITY_NPCS: readonly NpcDefinition[] = [LYRA, CASTOR, VANE, MARA, REN, DIRECTOR_VALE, NIA];
export const ALL_CITY_NPCS: readonly NpcDefinition[] = [SABLE, IVO, LYRA, CASTOR, VANE, MARA, REN, DIRECTOR_VALE, NIA];

