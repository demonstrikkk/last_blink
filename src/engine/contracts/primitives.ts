import { z } from 'zod';

/**
 * Every contract carries the same schema version. Bumping a contract means
 * bumping its entry in `contracts/registry.ts` and adding a migration note in
 * `docs/EVENT_MODEL.md`. The literal keeps documents from silently drifting.
 */
export const CONTRACT_VERSION = '1.0.0';

export const contractVersionSchema = z.literal(CONTRACT_VERSION);

export const versionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'version must be semver (x.y.z)');

export const gameVersionSchema = versionSchema;

export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const tickSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const stateVersionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const jsonValueSchema = z.json();

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

/**
 * IDs are prefixed and branded so a branch ID can never be passed where an
 * anchor ID is expected. The regex is the runtime half of the same guarantee.
 */
export function brandedId<Brand extends string>(prefix: string) {
  return z
    .string()
    .regex(new RegExp(`^${prefix}[a-z0-9_]{1,64}$`), `expected ${prefix} identifier`)
    .brand<Brand>();
}

export const sessionIdSchema = brandedId<'SessionId'>('ses_');
export const eventIdSchema = brandedId<'GameEventId'>('evt_');
export const factIdSchema = brandedId<'FactId'>('fct_');
export const choiceIdSchema = brandedId<'ChoiceId'>('cho_');
export const ruleIdSchema = brandedId<'RuleId'>('rul_');
export const anchorIdSchema = brandedId<'AnchorId'>('anc_');
export const branchIdSchema = brandedId<'BranchId'>('brn_');
export const npcIdSchema = brandedId<'NpcId'>('npc_');
export const observationIdSchema = brandedId<'ObservationId'>('obs_');
export const proposalIdSchema = brandedId<'ProposalId'>('prp_');
export const actionIdSchema = brandedId<'ActionId'>('act_');
export const memoryIdSchema = brandedId<'MemoryId'>('mem_');
export const manifestIdSchema = brandedId<'ManifestId'>('mft_');
export const playerIdSchema = brandedId<'PlayerId'>('ply_');
export const saveIdSchema = brandedId<'SaveId'>('sav_');

/** Actors may be a player, an NPC or the engine itself. */
export const actorIdSchema = z
  .string()
  .regex(/^(player|npc|system)_[a-z0-9_]{1,64}$/, 'expected player_, npc_ or system_ actor id')
  .brand<'ActorId'>();

/** A source is whoever produced an event: engine, player input or a policy. */
export const sourceIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, 'expected dotted source id')
  .brand<'SourceId'>();

/**
 * Fact keys are namespaced (`evidence.relay_7`, `debug.counter`). Evidence is
 * intentionally a fact namespace rather than a sixteenth contract; see
 * docs/adr/0004-evidence-as-facts.md.
 */
export const factKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/,
    'fact keys must be namespaced, e.g. evidence.relay_7',
  )
  .brand<'FactKey'>();

export const idempotencyKeySchema = z.string().min(8).max(128);

export const labelSchema = z.string().trim().min(1).max(60);

export const hashSchema = z.string().regex(/^[0-9a-f]{16}$/, 'expected 16 hex characters');

export const confidenceSchema = z.number().min(0).max(1);

/**
 * The full player/engine action vocabulary. Stage 4 adds `evidence.collect` and
 * `choice.make` additively; see docs/adr/0008-action-vocabulary-extension.md.
 * No event contract changed: both reuse `fact.asserted` and `choice.made`.
 */
export const actionTypeSchema = z.enum([
  'session.advance_tick',
  'session.noop',
  'fact.assert',
  'anchor.record',
  'branch.fork',
  'evidence.collect',
  'choice.make',
  'morrow.intervene',
  'npc.propose',
  'case.link',
  'case.hypothesis',
  'challenge.complete',
  'morrow.plan',
  'loop.reset',
]);

export type ActionType = z.infer<typeof actionTypeSchema>;

/**
 * Frozen Stage 3 action set for NPCs. NPC contracts intentionally do not widen
 * when the player action vocabulary does; an NPC can never be granted
 * `evidence.collect` or `choice.make` by content drift.
 */
export const npcActionTypeSchema = z.enum([
  'session.advance_tick',
  'session.noop',
  'fact.assert',
  'anchor.record',
  'branch.fork',
]);

export type NpcActionType = z.infer<typeof npcActionTypeSchema>;

export type SessionId = z.infer<typeof sessionIdSchema>;
export type GameEventId = z.infer<typeof eventIdSchema>;
export type FactId = z.infer<typeof factIdSchema>;
export type ChoiceId = z.infer<typeof choiceIdSchema>;
export type RuleId = z.infer<typeof ruleIdSchema>;
export type AnchorId = z.infer<typeof anchorIdSchema>;
export type BranchId = z.infer<typeof branchIdSchema>;
export type NpcId = z.infer<typeof npcIdSchema>;
export type ObservationId = z.infer<typeof observationIdSchema>;
export type ProposalId = z.infer<typeof proposalIdSchema>;
export type ActionId = z.infer<typeof actionIdSchema>;
export type MemoryId = z.infer<typeof memoryIdSchema>;
export type ManifestId = z.infer<typeof manifestIdSchema>;
export type PlayerId = z.infer<typeof playerIdSchema>;
export type SaveId = z.infer<typeof saveIdSchema>;
export type ActorId = z.infer<typeof actorIdSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type FactKey = z.infer<typeof factKeySchema>;
export type JsonValue = z.infer<typeof jsonValueSchema>;
export type JsonObject = z.infer<typeof jsonObjectSchema>;
