import { z } from 'zod';
import {
  actionIdSchema,
  actionTypeSchema,
  actorIdSchema,
  anchorIdSchema,
  branchIdSchema,
  contractVersionSchema,
  eventIdSchema,
  factKeySchema,
  gameVersionSchema,
  idempotencyKeySchema,
  isoTimestampSchema,
  npcIdSchema,
  observationIdSchema,
  proposalIdSchema,
  ruleIdSchema,
  sessionIdSchema,
  sourceIdSchema,
  stateVersionSchema,
  tickSchema,
  versionSchema,
} from './primitives.js';
import {
  MAX_MORROW_ESCALATION,
  morrowReasonCodeSchema,
  morrowResponseSchema,
} from './morrow.js';
import { factSchema } from './fact.js';
import { choiceSchema } from './choice.js';
import { anchorSchema } from './anchor.js';
import { branchSchema } from './branch.js';

const baseShape = {
  schemaVersion: contractVersionSchema,
  eventId: eventIdSchema,
  sessionId: sessionIdSchema,
  branchId: branchIdSchema,
  /** Session-wide, strictly increasing event counter. Equals stateVersion. */
  sequenceNo: z.number().int().positive(),
  /** Version the state reaches once this event is applied. */
  stateVersion: stateVersionSchema,
  tick: tickSchema,
  actorId: actorIdSchema,
  sourceId: sourceIdSchema,
  actionId: actionIdSchema.nullable(),
  occurredAt: isoTimestampSchema,
  idempotencyKey: idempotencyKeySchema,
};

function event<T extends z.ZodRawShape, U extends string>(type: U, payload: T) {
  return z.strictObject({
    ...baseShape,
    type: z.literal(type),
    payload: z.strictObject(payload),
  });
}

export const sessionStartedEventSchema = event('session.started', {
  contentId: z.string().trim().min(1).max(80),
  gameVersion: gameVersionSchema,
  seed: z.string().min(1).max(80),
});

export const tickAdvancedEventSchema = event('tick.advanced', {
  fromTick: tickSchema,
  toTick: tickSchema,
  reason: z.enum(['manual', 'timed']),
});

export const factAssertedEventSchema = event('fact.asserted', {
  fact: factSchema,
});

export const choiceMadeEventSchema = event('choice.made', {
  choice: choiceSchema,
});

export const ruleEvaluatedEventSchema = event('rule.evaluated', {
  ruleId: ruleIdSchema,
  matched: z.boolean(),
  assertedFactKeys: z.array(factKeySchema).max(8),
});

export const anchorRecordedEventSchema = event('anchor.recorded', {
  anchor: anchorSchema,
});

export const branchForkedEventSchema = event('branch.forked', {
  branch: branchSchema,
  fromAnchorId: anchorIdSchema,
});

export const npcProposalEvaluatedEventSchema = event('npc.proposal.evaluated', {
  proposalId: proposalIdSchema,
  npcId: npcIdSchema,
  status: z.enum(['accepted', 'rejected']),
  reasonCode: z.string().trim().min(1).max(80),
});

export const endingReachedEventSchema = event('ending.reached', {
  endingId: z.string().trim().min(1).max(64),
  summary: z.string().trim().min(1).max(280),
  factKeys: z.array(factKeySchema).max(64),
});

export const morrowProposalEvaluatedEventSchema = event('morrow.proposal.evaluated', {
  proposalId: proposalIdSchema,
  policyId: z.string().trim().min(1).max(80),
  policyVersion: versionSchema,
  observationId: observationIdSchema,
  response: morrowResponseSchema,
  status: z.enum(['accepted', 'rejected']),
  reasonCodes: z.array(morrowReasonCodeSchema).max(8),
  reason: z.string().trim().min(1).max(280).nullable(),
});

export const morrowIntervenedEventSchema = event('morrow.intervened', {
  proposalId: proposalIdSchema,
  policyId: z.string().trim().min(1).max(80),
  policyVersion: versionSchema,
  response: morrowResponseSchema,
  reasonCodes: z.array(morrowReasonCodeSchema).min(1).max(8),
  escalation: z.number().int().min(0).max(MAX_MORROW_ESCALATION),
});

export const actionRejectedEventSchema = event('action.rejected', {
  actionType: actionTypeSchema,
  code: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(280),
  proposalId: proposalIdSchema.nullable(),
});

export const gameEventSchema = z.discriminatedUnion('type', [
  sessionStartedEventSchema,
  tickAdvancedEventSchema,
  factAssertedEventSchema,
  choiceMadeEventSchema,
  ruleEvaluatedEventSchema,
  anchorRecordedEventSchema,
  branchForkedEventSchema,
  npcProposalEvaluatedEventSchema,
  morrowProposalEvaluatedEventSchema,
  morrowIntervenedEventSchema,
  endingReachedEventSchema,
  actionRejectedEventSchema,
]);

export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameEventType = GameEvent['type'];
export type SessionStartedEvent = z.infer<typeof sessionStartedEventSchema>;
export type TickAdvancedEvent = z.infer<typeof tickAdvancedEventSchema>;
export type FactAssertedEvent = z.infer<typeof factAssertedEventSchema>;
export type ChoiceMadeEvent = z.infer<typeof choiceMadeEventSchema>;
export type RuleEvaluatedEvent = z.infer<typeof ruleEvaluatedEventSchema>;
export type AnchorRecordedEvent = z.infer<typeof anchorRecordedEventSchema>;
export type BranchForkedEvent = z.infer<typeof branchForkedEventSchema>;
export type NpcProposalEvaluatedEvent = z.infer<typeof npcProposalEvaluatedEventSchema>;
export type MorrowProposalEvaluatedEvent = z.infer<typeof morrowProposalEvaluatedEventSchema>;
export type MorrowIntervenedEvent = z.infer<typeof morrowIntervenedEventSchema>;
export type EndingReachedEvent = z.infer<typeof endingReachedEventSchema>;
export type ActionRejectedEvent = z.infer<typeof actionRejectedEventSchema>;

export const EVENT_TYPES: readonly GameEventType[] = [
  'session.started',
  'tick.advanced',
  'fact.asserted',
  'choice.made',
  'rule.evaluated',
  'anchor.recorded',
  'branch.forked',
  'npc.proposal.evaluated',
  'morrow.proposal.evaluated',
  'morrow.intervened',
  'ending.reached',
  'action.rejected',
] as const;
