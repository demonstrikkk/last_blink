import type { ContractName } from './contractNames.js';
import { CONTRACT_VERSION } from './primitives.js';

const NOW = '2026-01-01T00:00:00.000Z';
const SESSION = 'ses_stage3demo';
const BRANCH = 'brn_main';
const EVENT = 'evt_000001';

export const factFixture = {
  schemaVersion: CONTRACT_VERSION,
  factId: 'fct_000001',
  key: 'debug.counter',
  value: 1,
  kind: 'asserted',
  confidence: 1,
  sourceEventId: EVENT,
  branchId: BRANCH,
  acquiredAtTick: 0,
  source: { kind: 'system', ref: 'stage3.fixture' },
};

export const playerProfileFixture = {
  schemaVersion: CONTRACT_VERSION,
  playerId: 'ply_stage3player',
  displayName: 'Field Auditor',
  createdAt: NOW,
  consent: { telemetry: false, npcMemory: true },
  behaviouralSignals: { explorationStyle: 'thorough', decisionLatencyBand: 'measured' },
  progress: { choicesMade: 1, evidenceFound: 1, anchorsReached: 1 },
};

export const choiceFixture = {
  schemaVersion: CONTRACT_VERSION,
  choiceId: 'cho_000001',
  sessionId: SESSION,
  branchId: BRANCH,
  nodeId: 'node.relay_intro',
  optionId: 'option.listen',
  madeAtTick: 1,
  sourceEventId: 'evt_000004',
  consequenceKeys: ['evidence.relay_7'],
};

export const anchorFixture = {
  schemaVersion: CONTRACT_VERSION,
  anchorId: 'anc_000001',
  sessionId: SESSION,
  branchId: BRANCH,
  label: 'Relay approach',
  tick: 1,
  stateVersion: 1,
  stateHash: '0123456789abcdef',
  eventSequenceNo: 2,
  safe: true,
  sourceEventId: 'evt_000002',
  createdAt: NOW,
};

export const branchFixture = {
  schemaVersion: CONTRACT_VERSION,
  branchId: BRANCH,
  sessionId: SESSION,
  parentBranchId: null,
  forkedAtAnchorId: null,
  forkedAtTick: null,
  forkedAtStateVersion: null,
  label: 'Original timeline',
  status: 'active',
  timelineIndex: 0,
  createdAt: NOW,
};

export const gameStateFixture = {
  schemaVersion: CONTRACT_VERSION,
  sessionId: SESSION,
  branchId: BRANCH,
  stateVersion: 2,
  tick: 1,
  contentId: 'content.stage3',
  gameVersion: '0.1.0',
  seed: 'stage3-deterministic',
  facts: { 'debug.counter': factFixture },
  choices: [choiceFixture],
  anchors: [anchorFixture],
  branches: [branchFixture],
  player: playerProfileFixture,
  endingId: null,
  lastEventId: 'evt_000002',
  rngCursor: 0,
};

export const ruleFixture = {
  schemaVersion: CONTRACT_VERSION,
  ruleId: 'rul_counter_threshold',
  description: 'Raise a flag once the debug counter reaches two.',
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
      sourceRef: 'rule.rul_counter_threshold',
    },
  ],
};

export const npcDefinitionFixture = {
  schemaVersion: CONTRACT_VERSION,
  npcId: 'npc_archivist',
  displayName: 'Archivist Venn',
  role: 'Settlement record keeper',
  goals: [
    { goalId: 'protect_records', description: 'Keep the settlement archive intact.', priority: 4 },
  ],
  knowledgeScopes: ['evidence.', 'settlement.'],
  permissions: {
    observableFactPrefixes: ['evidence.', 'settlement.'],
    allowedActionTypes: ['session.noop', 'fact.assert'],
    mayProposeOnly: true,
  },
  memoryNamespace: 'archivist_venn',
  modelManifestId: null,
  voice: { register: 'clipped', speechRate: 0.95 },
};

export const npcObservationFixture = {
  schemaVersion: CONTRACT_VERSION,
  observationId: 'obs_000001',
  npcId: 'npc_archivist',
  sessionId: SESSION,
  branchId: BRANCH,
  tick: 1,
  stateVersion: 2,
  visibleFacts: [
    {
      factId: 'fct_000001',
      key: 'debug.counter',
      value: 1,
      confidence: 1,
    },
  ],
  recentEventIds: ['evt_000001', 'evt_000002'],
  perceptionHash: 'fedcba9876543210',
  modelManifestId: null,
  createdAt: NOW,
};

export const npcDecisionProposalFixture = {
  schemaVersion: CONTRACT_VERSION,
  proposalId: 'prp_000001',
  npcId: 'npc_archivist',
  observationId: 'obs_000001',
  sessionId: SESSION,
  branchId: BRANCH,
  tick: 1,
  proposedActions: [
    {
      actionType: 'session.noop',
      targetId: null,
      params: { reason: 'observe_only' },
    },
  ],
  rationale: 'The archive is unchanged; no intervention is warranted.',
  confidence: 0.8,
  modelManifestId: null,
  requiresValidation: true,
  createdAt: NOW,
};

export const actionResultFixture = {
  schemaVersion: CONTRACT_VERSION,
  actionId: 'act_000001',
  sessionId: SESSION,
  branchId: BRANCH,
  actorId: 'system_engine',
  sourceId: 'engine.core',
  actionType: 'session.advance_tick',
  proposalId: null,
  status: 'accepted',
  tick: 1,
  stateVersion: 2,
  eventIds: ['evt_000002'],
  rejection: null,
  resultingStateHash: '0011223344556677',
  createdAt: NOW,
};

export const memoryRecordFixture = {
  schemaVersion: CONTRACT_VERSION,
  memoryId: 'mem_000001',
  npcId: 'npc_archivist',
  sessionId: SESSION,
  branchId: BRANCH,
  kind: 'episodic',
  content: 'The auditor asked about the relay log and waited for the answer.',
  provenance: { sourceEventIds: ['evt_000004'], sourceMemoryIds: [] },
  createdAtTick: 1,
  importance: 0.6,
  expiresAtTick: null,
  visibility: 'private',
  modelManifestId: null,
  tags: ['relay', 'auditor'],
};

export const modelManifestFixture = {
  schemaVersion: CONTRACT_VERSION,
  manifestId: 'mft_scripted_v1',
  policyId: 'policy.npc.scripted',
  policyKind: 'scripted',
  version: '1.0.0',
  provider: 'local',
  modelId: null,
  promptVersion: null,
  seed: null,
  deterministic: true,
  capabilities: ['propose_action'],
  createdAt: NOW,
  notes: 'Deterministic fallback policy; no network calls.',
};

export const gameEventFixture = {
  schemaVersion: CONTRACT_VERSION,
  eventId: 'evt_000002',
  sessionId: SESSION,
  branchId: BRANCH,
  sequenceNo: 2,
  stateVersion: 2,
  tick: 1,
  type: 'tick.advanced',
  actorId: 'system_engine',
  sourceId: 'engine.core',
  actionId: null,
  occurredAt: NOW,
  idempotencyKey: 'stage3-fixture-tick-2',
  payload: { fromTick: 0, toTick: 1, reason: 'manual' },
};

export const saveEnvelopeFixture = {
  schemaVersion: CONTRACT_VERSION,
  saveFormatVersion: 1,
  saveId: 'sav_000001',
  gameVersion: '0.1.0',
  sessionId: SESSION,
  savedAt: NOW,
  engineStateHash: '0011223344556677',
  contractVersions: { GameEvent: CONTRACT_VERSION, GameState: CONTRACT_VERSION },
  payload: gameStateFixture,
  checksum: '8899aabbccddeeff',
};

export const contractFixtures: Record<
  ContractName,
  { valid: object; invalid: object }
> = {
  GameEvent: {
    valid: gameEventFixture,
    invalid: { ...gameEventFixture, eventId: 'not-an-event-id' },
  },
  GameState: {
    valid: gameStateFixture,
    invalid: {
      ...gameStateFixture,
      facts: { 'debug.counter': { ...factFixture, key: 'debug.other' } },
    },
  },
  Fact: { valid: factFixture, invalid: { ...factFixture, confidence: 1.5 } },
  Choice: { valid: choiceFixture, invalid: { ...choiceFixture, consequenceKeys: 'evidence.relay_7' } },
  Rule: {
    valid: ruleFixture,
    invalid: {
      ...ruleFixture,
      condition: { kind: 'fact', key: 'debug.counter', op: 'exists', value: 1 },
    },
  },
  Anchor: { valid: anchorFixture, invalid: { ...anchorFixture, label: '' } },
  Branch: {
    valid: branchFixture,
    invalid: {
      ...branchFixture,
      parentBranchId: 'brn_parent',
      forkedAtAnchorId: null,
    },
  },
  NpcDefinition: {
    valid: npcDefinitionFixture,
    invalid: {
      ...npcDefinitionFixture,
      permissions: { ...npcDefinitionFixture.permissions, mayProposeOnly: false },
    },
  },
  NpcObservation: {
    valid: npcObservationFixture,
    invalid: { ...npcObservationFixture, tick: -1 },
  },
  NpcDecisionProposal: {
    valid: npcDecisionProposalFixture,
    invalid: { ...npcDecisionProposalFixture, requiresValidation: false },
  },
  ActionResult: {
    valid: actionResultFixture,
    invalid: { ...actionResultFixture, status: 'rejected' },
  },
  SaveEnvelope: {
    valid: saveEnvelopeFixture,
    invalid: { ...saveEnvelopeFixture, saveFormatVersion: 2 },
  },
  PlayerProfile: {
    valid: playerProfileFixture,
    invalid: { ...playerProfileFixture, displayName: '   ' },
  },
  MemoryRecord: {
    valid: memoryRecordFixture,
    invalid: { ...memoryRecordFixture, expiresAtTick: 0 },
  },
  ModelManifest: {
    valid: modelManifestFixture,
    invalid: { ...modelManifestFixture, deterministic: false },
  },
};
