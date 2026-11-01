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

export const ORIN = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_orin',
  displayName: 'Orin',
  role: 'Relay 7 technician',
  goals: [
    { goalId: 'protect_the_core', description: 'Keep the Relay 7 buffer from being wiped.', priority: 5 },
    { goalId: 'explain_the_hold', description: 'Explain the command hold without blaming hardware.', priority: 3 },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.orin.'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.orin.'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'orin_relay',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 1.0 },
});

export const KADE = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_kade',
  displayName: 'Kade',
  role: 'Freight yard dockworker',
  goals: [
    { goalId: 'clear_the_yard', description: 'Find out why dock four was sealed.', priority: 5 },
    { goalId: 'keep_the_shift', description: 'Avoid being blamed for a missing crate.', priority: 3 },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.kade.'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.kade.'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'kade_yard',
  modelManifestId: null,
  voice: { register: 'warm', speechRate: 1.0 },
});

export const SURI = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_suri',
  displayName: 'Suri',
  role: 'Street medic',
  goals: [
    { goalId: 'count_the_harm', description: 'Make the clinical cost of the hold visible.', priority: 5 },
    { goalId: 'restore_supply', description: 'Get the held shipment released.', priority: 4 },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.suri.', 'world.ward_alert'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.suri.', 'world.ward_alert'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'suri_clinic',
  modelManifestId: null,
  voice: { register: 'warm', speechRate: 0.95 },
});

export const TAMSIN = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_tamsin',
  displayName: 'Tamsin',
  role: 'Relay Terraces resident',
  goals: [
    { goalId: 'be_counted', description: 'Put the residents of Relay Terraces in the record.', priority: 5 },
    { goalId: 'get_the_lifts_back', description: 'Restore power to the terraces.', priority: 4 },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.tamsin.', 'world.ward_alert'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.tamsin.', 'world.ward_alert'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'tamsin_terraces',
  modelManifestId: null,
  voice: { register: 'neutral', speechRate: 1.05 },
});

export const WARD_RUNNER = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_ward_runner',
  displayName: 'Ward Runner',
  role: 'Anonymous dispatch runner',
  goals: [
    { goalId: 'stay_unrecorded', description: 'Stay off the ward record.', priority: 5 },
    { goalId: 'offload_the_token', description: 'Explain the root token before it burns him.', priority: 4 },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.ward_runner.'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.ward_runner.'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'runner_ward',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 1.15 },
});

export const MOTH = npcDefinitionSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_moth',
  displayName: 'Moth',
  role: 'Relay companion drone',
  goals: [
    { goalId: 'stay_with_aster', description: 'Follow Aster through the ring roads.', priority: 5 },
    { goalId: 'count_the_marks', description: 'Report the evidence currently held on the branch.', priority: 4 },
  ],
  knowledgeScopes: ['evidence.', 'story.', 'npc.moth.'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'story.', 'npc.moth.'],
    allowedActionTypes: ['session.noop'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'moth_companion',
  modelManifestId: null,
  voice: { register: 'synthetic', speechRate: 1.1 },
});

export const STAGE9_NPC_DEFINITIONS: Record<NpcId, NpcDefinition> = {
  [SABLE.npcId]: SABLE,
  [IVO.npcId]: IVO,
  [LYRA.npcId]: LYRA,
  [CASTOR.npcId]: CASTOR,
  [VANE.npcId]: VANE,
  [MARA.npcId]: MARA,
  [REN.npcId]: REN,
  [DIRECTOR_VALE.npcId]: DIRECTOR_VALE,
  [NIA.npcId]: NIA,
  [ORIN.npcId]: ORIN,
  [KADE.npcId]: KADE,
  [SURI.npcId]: SURI,
  [TAMSIN.npcId]: TAMSIN,
  [WARD_RUNNER.npcId]: WARD_RUNNER,
  [MOTH.npcId]: MOTH,
};

export const STAGE9_NPC_LIST: readonly NpcDefinition[] = [
  SABLE,
  IVO,
  LYRA,
  CASTOR,
  VANE,
  MARA,
  REN,
  DIRECTOR_VALE,
  NIA,
  ORIN,
  KADE,
  SURI,
  TAMSIN,
  WARD_RUNNER,
  MOTH,
];
export const EXPANDED_CITY_NPCS: readonly NpcDefinition[] = [
  LYRA,
  CASTOR,
  VANE,
  MARA,
  REN,
  DIRECTOR_VALE,
  NIA,
  ORIN,
  KADE,
  SURI,
  TAMSIN,
  WARD_RUNNER,
  MOTH,
];
export const ALL_CITY_NPCS: readonly NpcDefinition[] = STAGE9_NPC_LIST;

