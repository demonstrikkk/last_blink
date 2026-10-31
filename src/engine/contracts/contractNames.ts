export const CONTRACT_NAMES = [
  'GameEvent',
  'GameState',
  'Fact',
  'Choice',
  'Rule',
  'Anchor',
  'Branch',
  'NpcDefinition',
  'NpcObservation',
  'NpcDecisionProposal',
  'ActionResult',
  'SaveEnvelope',
  'PlayerProfile',
  'MemoryRecord',
  'ModelManifest',
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];
