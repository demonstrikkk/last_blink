import type { GameState, Rejection } from '../contracts/index.js';
import { anchorIdSchema } from '../contracts/index.js';
import type { GameContent } from '../content/stage3Content.js';
import {
  advanceTickParamsSchema,
  anchorParamsSchema,
  choiceMakeParamsSchema,
  caseLinkParamsSchema,
  caseHypothesisParamsSchema,
  challengeCompleteParamsSchema,
  evidenceCollectParamsSchema,
  factAssertParamsSchema,
  forkParamsSchema,
  gameActionSchema,
  loopResetParamsSchema,
  morrowInterveneParamsSchema,
  morrowPlanParamsSchema,
  noopParamsSchema,
  npcProposeParamsSchema,
  type GameAction,
  type ParsedAction,
} from './actions.js';
import { canonicalJson } from './canonicalJson.js';
import {
  MAX_MORROW_ESCALATION,
  type MorrowResponse,
} from '../contracts/morrow.js';
import {
  isMorrowTransitionAllowed,
  morrowEscalationOf,
  morrowResponseOf,
} from '../morrow/fairness.js';
import { MAX_MORROW_TARGETS } from '../contracts/loop.js';

export type RejectionCode = Rejection['code'];

export type ActionValidation =
  | { ok: true; action: ParsedAction }
  | { ok: false; code: RejectionCode; message: string; details: Record<string, unknown> };

function fail(
  code: RejectionCode,
  message: string,
  details: Record<string, unknown> = {},
): ActionValidation {
  return { ok: false, code, message, details };
}

/**
 * Boundary validation for every action, whether it came from the UI, a test or
 * an NPC proposal. Validation is pure: it never mutates state.
 */
export function validateAction(
  state: GameState,
  raw: unknown,
  content: GameContent,
): ActionValidation {
  const parsed = gameActionSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('invalid_action', 'action does not match the action schema', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const action: GameAction = parsed.data;

  // Once the day has ended, the only forward move is back to 08:00. BLINK and
  // exploration are not a way to keep playing inside a failed timeline.
  if (
    state.catastrophe.status === 'occurred' &&
    action.actionType !== 'loop.reset' &&
    action.actionType !== 'session.noop'
  ) {
    return fail(
      'deadline_passed',
      'this timeline ended at 18:00; return to 08:00 to open a new loop',
      { tick: state.tick, loopIndex: state.loop.index },
    );
  }

  switch (action.actionType) {
    case 'session.noop': {
      const params = noopParamsSchema.safeParse(action.params);
      if (!params.success) return fail('invalid_action', 'session.noop takes no parameters');
      return { ok: true, action: { actionType: 'session.noop', actorId: action.actorId, params: {} } };
    }

    case 'session.advance_tick': {
      const params = advanceTickParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'ticks must be an integer between 1 and 10');
      }
      return {
        ok: true,
        action: { actionType: 'session.advance_tick', actorId: action.actorId, params: params.data },
      };
    }

    case 'fact.assert': {
      const params = factAssertParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'fact.assert requires a namespaced key and a JSON value');
      }
      if (!params.data.key.startsWith('debug.') && !params.data.key.startsWith('scar.')) {
        return fail('invalid_action', 'actions may only assert debug.* or scar.* facts', {
          key: params.data.key,
        });
      }
      if (canonicalJson(params.data.value).length > 4096) {
        return fail('invalid_action', 'fact value exceeds 4096 canonical bytes');
      }
      return {
        ok: true,
        action: { actionType: 'fact.assert', actorId: action.actorId, params: params.data },
      };
    }

    case 'anchor.record': {
      const params = anchorParamsSchema.safeParse(action.params);
      if (!params.success) return fail('invalid_action', 'anchor.record requires a label');
      if (state.anchors.some((anchor) => anchor.tick === state.tick)) {
        return fail('duplicate', 'this tick already has an anchor', {
          tick: state.tick,
        });
      }
      return {
        ok: true,
        action: { actionType: 'anchor.record', actorId: action.actorId, params: params.data },
      };
    }

    case 'branch.fork': {
      const params = forkParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'branch.fork requires an anchor id and label');
      }
      const anchor = state.anchors.find((candidate) => candidate.anchorId === params.data.anchorId);
      if (!anchor) {
        return fail('unknown_target', 'anchor does not exist in this branch', {
          anchorId: params.data.anchorId,
        });
      }
      if (!anchor.safe) {
        return fail('policy_denied', 'unsafe anchors cannot be used for BLINK', {
          anchorId: anchor.anchorId,
        });
      }
      if (state.branches.some((branch) => branch.forkedAtAnchorId === anchor.anchorId)) {
        return fail('duplicate', 'this anchor has already been forked', {
          anchorId: anchor.anchorId,
        });
      }
      const parsedAnchorId = anchorIdSchema.safeParse(params.data.anchorId);
      if (!parsedAnchorId.success) {
        return fail('invalid_action', 'anchor id is malformed');
      }
      return {
        ok: true,
        action: { actionType: 'branch.fork', actorId: action.actorId, params: params.data },
      };
    }

    case 'evidence.collect': {
      const params = evidenceCollectParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'evidence.collect requires a content evidence id');
      }
      const definition = content.evidence.find(
        (candidate) => candidate.evidenceId === params.data.evidenceId,
      );
      if (!definition) {
        return fail('unknown_target', 'evidence is not defined by content', {
          evidenceId: params.data.evidenceId,
        });
      }
      if (state.facts[definition.factKey] !== undefined) {
        return fail('duplicate', 'evidence has already been collected', {
          evidenceId: definition.evidenceId,
          factKey: definition.factKey,
        });
      }
      const missing = definition.requires.filter((key) => state.facts[key] === undefined);
      if (missing.length > 0) {
        return fail('invalid_action', 'evidence prerequisites are not met', {
          evidenceId: definition.evidenceId,
          missing,
        });
      }
      return {
        ok: true,
        action: {
          actionType: 'evidence.collect',
          actorId: action.actorId,
          params: params.data,
        },
      };
    }

    case 'choice.make': {
      const params = choiceMakeParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'choice.make requires a node id and an option id');
      }
      const node = content.choices.find((candidate) => candidate.nodeId === params.data.nodeId);
      if (!node) {
        return fail('unknown_target', 'choice node is not defined by content', {
          nodeId: params.data.nodeId,
        });
      }
      const option = node.options.find(
        (candidate) => candidate.optionId === params.data.optionId,
      );
      if (!option) {
        return fail('unknown_target', 'choice option is not defined on this node', {
          nodeId: params.data.nodeId,
          optionId: params.data.optionId,
        });
      }
      if (state.choices.some((choice) => choice.nodeId === node.nodeId)) {
        return fail('duplicate', 'this node has already been decided', {
          nodeId: node.nodeId,
        });
      }
      const missing = node.requires.filter((key) => state.facts[key] === undefined);
      if (missing.length > 0) {
        return fail('invalid_action', 'choice prerequisites are not met', {
          nodeId: node.nodeId,
          missing,
        });
      }
      return {
        ok: true,
        action: { actionType: 'choice.make', actorId: action.actorId, params: params.data },
      };
    }

    case 'case.link': {
      const params = caseLinkParamsSchema.safeParse(action.params);
      if (!params.success) return fail('invalid_action', 'case.link requires two evidence ids, a relation, and a note');
      if (params.data.leftEvidenceId === params.data.rightEvidenceId) {
        return fail('invalid_action', 'a case link needs two distinct evidence records');
      }
      const definitions = [params.data.leftEvidenceId, params.data.rightEvidenceId].map((evidenceId) =>
        content.evidence.find((candidate) => candidate.evidenceId === evidenceId),
      );
      if (definitions.some((definition) => !definition)) return fail('unknown_target', 'case links may only use content evidence');
      if (definitions.some((definition) => state.facts[definition!.factKey] === undefined)) {
        return fail('invalid_action', 'case links may only use collected evidence');
      }
      const existing = state.caseLinks.find((link) => link.linkId === params.data.linkId);
      if (existing && (existing.leftEvidenceId !== params.data.leftEvidenceId || existing.rightEvidenceId !== params.data.rightEvidenceId)) {
        return fail('invalid_action', 'a case link id cannot be reassigned to different evidence');
      }
      if (existing && existing.relation === params.data.relation && existing.note === params.data.note) {
        return fail('duplicate', 'this case connection is already recorded', { linkId: existing.linkId });
      }
      return { ok: true, action: { actionType: 'case.link', actorId: action.actorId, params: params.data } };
    }

    case 'case.hypothesis': {
      const params = caseHypothesisParamsSchema.safeParse(action.params);
      if (!params.success) return fail('invalid_action', 'case.hypothesis requires text and evidence attachments');
      const allEvidence = [...params.data.supportingEvidenceIds, ...params.data.opposingEvidenceIds];
      if (new Set(allEvidence).size !== allEvidence.length) return fail('invalid_action', 'hypothesis evidence cannot be duplicated');
      for (const evidenceId of allEvidence) {
        const definition = content.evidence.find((candidate) => candidate.evidenceId === evidenceId);
        if (!definition) return fail('unknown_target', 'hypotheses may only cite content evidence', { evidenceId });
        if (state.facts[definition.factKey] === undefined) return fail('invalid_action', 'hypotheses may only cite collected evidence', { evidenceId });
      }
      const existing = state.hypotheses.find((hypothesis) => hypothesis.hypothesisId === params.data.hypothesisId);
      if (existing && existing.text === params.data.text &&
        JSON.stringify(existing.supportingEvidenceIds) === JSON.stringify(params.data.supportingEvidenceIds) &&
        JSON.stringify(existing.opposingEvidenceIds) === JSON.stringify(params.data.opposingEvidenceIds)) {
        return fail('duplicate', 'this hypothesis revision is already recorded', { hypothesisId: existing.hypothesisId });
      }
      return { ok: true, action: { actionType: 'case.hypothesis', actorId: action.actorId, params: params.data } };
    }

    case 'challenge.complete': {
      const params = challengeCompleteParamsSchema.safeParse(action.params);
      if (!params.success) return fail('invalid_action', 'challenge.complete has an invalid answer shape');
      if (state.challengeResults.some((result) => result.challengeId === params.data.challengeId)) {
        return fail('duplicate', 'this challenge has already been completed', { challengeId: params.data.challengeId });
      }
      if (params.data.challengeType === 'timeline_reconstruction') {
        if (!('order' in params.data.answer) || params.data.answer.order.join(',') !== 'relay_7_log,ward_dispatch,vendor_testimony') {
          return fail('invalid_action', 'the recorded timeline order does not match the authored evidence', { challengeId: params.data.challengeId });
        }
        const required = ['relay_7_log', 'ward_dispatch', 'vendor_testimony'];
        if (required.some((id) => !content.evidence.some((item) => item.evidenceId === id && state.facts[item.factKey] !== undefined))) {
          return fail('invalid_action', 'timeline reconstruction requires the three collected records', { required });
        }
      } else {
        if (!('question' in params.data.answer) || params.data.answer.question !== 'ask_route_seal') {
          return fail('invalid_action', 'that response does not validate the witness contradiction');
        }
        const required = ['ward_dispatch', 'vendor_testimony'];
        if (required.some((id) => !content.evidence.some((item) => item.evidenceId === id && state.facts[item.factKey] !== undefined))) {
          return fail('invalid_action', 'contradiction questioning requires both the slip and the witness account', { required });
        }
        // Shaped testimony is still usable, but pressing a hesitating witness on
        // their own words alone is not enough. The physical record anchors it.
        const testimonyDefinition = content.evidence.find(
          (item) => item.evidenceId === 'vendor_testimony',
        );
        const testimonyFact = testimonyDefinition
          ? state.facts[testimonyDefinition.factKey]
          : undefined;
        if (testimonyFact?.contaminated === true) {
          const relayDefinition = content.evidence.find(
            (item) => item.evidenceId === 'relay_7_log',
          );
          if (!relayDefinition || state.facts[relayDefinition.factKey] === undefined) {
            return fail(
              'invalid_action',
              "Ivo's account keeps slipping against itself. Anchor the contradiction in the Relay 7 hardware record before you press him.",
              { requires: 'relay_7_log', reason: 'contaminated_testimony' },
            );
          }
        }
      }
      return { ok: true, action: { actionType: 'challenge.complete', actorId: action.actorId, params: params.data } };
    }

    case 'morrow.intervene': {
      const params = morrowInterveneParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'morrow.intervene requires a complete, typed proposal');
      }
      if (action.actorId !== 'system_morrow') {
        return fail('invalid_action', 'only system_morrow may submit MORROW proposals', {
          actorId: action.actorId,
        });
      }
      const proposal = params.data;
      if (proposal.basedOnStateVersion !== state.stateVersion) {
        return fail('stale_state', 'the proposal was decided against an older state version', {
          proposalId: proposal.proposalId,
          basedOnStateVersion: proposal.basedOnStateVersion,
          stateVersion: state.stateVersion,
        });
      }
      const recorded = state.facts['morrow.last_proposal']?.value;
      if (recorded === proposal.proposalId) {
        return fail('duplicate', 'this proposal has already been recorded on the branch', {
          proposalId: proposal.proposalId,
        });
      }

      const current = morrowResponseOf(state);
      if (!isMorrowTransitionAllowed(current, proposal.response as MorrowResponse)) {
        return fail('policy_denied', 'the response is not reachable from the current posture', {
          proposalId: proposal.proposalId,
          from: current,
          to: proposal.response,
        });
      }

      const escalation = morrowEscalationOf(state);
      if (proposal.response === 'escalate' && escalation >= MAX_MORROW_ESCALATION) {
        return fail('policy_denied', 'the escalation ceiling has been reached', {
          proposalId: proposal.proposalId,
          escalation,
          ceiling: MAX_MORROW_ESCALATION,
        });
      }

      // Fairness: once the story has committed an ending, MORROW may only stand
      // down. It can never keep the player locked in a punitive posture.
      if (state.endingId !== null && proposal.response !== 'release' && proposal.response !== 'observe') {
        return fail('policy_denied', 'no new escalation is permitted after an ending', {
          proposalId: proposal.proposalId,
          response: proposal.response,
          endingId: state.endingId,
        });
      }

      return {
        ok: true,
        action: { actionType: 'morrow.intervene', actorId: action.actorId, params: proposal },
      };
    }

    case 'npc.propose': {
      const params = npcProposeParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'npc.propose requires a complete, typed proposal');
      }
      const proposal = params.data.proposal;
      if (String(action.actorId) !== String(proposal.npcId)) {
        return fail('invalid_action', 'an NPC may only submit its own proposal', {
          actorId: action.actorId,
          npcId: proposal.npcId,
        });
      }
      if (proposal.sessionId !== state.sessionId) {
        return fail('invalid_action', 'the proposal belongs to another session', {
          proposalId: proposal.proposalId,
        });
      }
      if (proposal.branchId !== state.branchId) {
        return fail('invalid_action', 'the proposal belongs to another branch', {
          proposalId: proposal.proposalId,
          branchId: proposal.branchId,
        });
      }
      if (proposal.tick !== state.tick) {
        return fail('stale_state', 'the proposal was decided at an older tick', {
          proposalId: proposal.proposalId,
          tick: proposal.tick,
          stateTick: state.tick,
        });
      }
      if (params.data.basedOnStateVersion !== state.stateVersion) {
        return fail('stale_state', 'the proposal was decided against an older state version', {
          proposalId: proposal.proposalId,
          basedOnStateVersion: params.data.basedOnStateVersion,
          stateVersion: state.stateVersion,
        });
      }
      if (proposal.observationId !== `obs_${params.data.observationHash}`) {
        return fail('invalid_action', 'the proposal is not bound to its observation hash', {
          proposalId: proposal.proposalId,
          observationId: proposal.observationId,
        });
      }
      if (
        proposal.proposedActions.some(
          (proposed) => proposed.actionType !== 'session.noop',
        )
      ) {
        return fail(
          'invalid_action',
          'Stage 9 NPC proposals may only carry a session.noop action',
          { proposalId: proposal.proposalId },
        );
      }
      return {
        ok: true,
        action: { actionType: 'npc.propose', actorId: action.actorId, params: params.data },
      };
    }

    case 'morrow.plan': {
      const params = morrowPlanParamsSchema.safeParse(action.params);
      if (!params.success) {
        return fail('invalid_action', 'morrow.plan requires a complete, typed plan');
      }
      if (action.actorId !== 'system_morrow') {
        return fail('invalid_action', 'only system_morrow may submit a plan', {
          actorId: action.actorId,
        });
      }
      const plan = params.data.plan;
      if (plan.sessionId !== state.sessionId) {
        return fail('invalid_action', 'the plan belongs to another session', {
          planId: plan.planId,
        });
      }
      if (plan.branchId !== state.branchId) {
        return fail('invalid_action', 'the plan belongs to another branch', {
          planId: plan.planId,
          branchId: plan.branchId,
        });
      }
      if (plan.loopIndex !== state.loop.index) {
        return fail('stale_state', 'the plan was built for another loop', {
          planId: plan.planId,
          planLoop: plan.loopIndex,
          loopIndex: state.loop.index,
        });
      }
      if (plan.createdAtTick !== state.tick) {
        return fail('stale_state', 'the plan was built at an older tick', {
          planId: plan.planId,
          planTick: plan.createdAtTick,
          tick: state.tick,
        });
      }
      // Schema max is a second line of defence; this is the engine's explicit
      // refusal of a plan that touches too many minds.
      if (plan.targets.length > MAX_MORROW_TARGETS) {
        return fail('policy_denied', 'MORROW may influence at most three NPCs per loop', {
          planId: plan.planId,
          targets: plan.targets.length,
          ceiling: MAX_MORROW_TARGETS,
        });
      }
      const targetIds = plan.targets.map((target) => String(target.npcId));
      if (new Set(targetIds).size !== targetIds.length) {
        return fail('invalid_action', 'a plan cannot target the same NPC twice', {
          planId: plan.planId,
          targets: targetIds,
        });
      }
      if (state.morrowPlan !== null && state.morrowPlan.loopIndex === state.loop.index) {
        return fail('duplicate', 'this loop already has a MORROW plan', {
          planId: state.morrowPlan.planId,
        });
      }
      return {
        ok: true,
        action: { actionType: 'morrow.plan', actorId: action.actorId, params: params.data },
      };
    }

    case 'loop.reset': {
      const params = loopResetParamsSchema.safeParse(action.params);
      if (!params.success) return fail('invalid_action', 'loop.reset requires a label');
      if (!String(action.actorId).startsWith('player_')) {
        return fail('invalid_action', 'only the investigator can return to 08:00', {
          actorId: action.actorId,
        });
      }
      if (state.catastrophe.status !== 'occurred') {
        return fail('invalid_action', 'the day has not ended, so there is nothing to reset', {
          status: state.catastrophe.status,
          tick: state.tick,
        });
      }
      if (state.endingId !== null) {
        return fail('invalid_action', 'this timeline is already resolved', {
          endingId: state.endingId,
        });
      }
      if (state.loop.checkpointFacts.length === 0) {
        return fail('stale_state', 'the 08:00 checkpoint is missing from this branch', {
          loopIndex: state.loop.index,
        });
      }
      if (state.branches.length >= 64) {
        return fail('policy_denied', 'the session has reached its timeline limit', {
          branches: state.branches.length,
        });
      }
      return {
        ok: true,
        action: { actionType: 'loop.reset', actorId: action.actorId, params: params.data },
      };
    }

    default: {
      const exhaustive: never = action.actionType;
      return fail('unknown_action', `unknown action type ${String(exhaustive)}`);
    }
  }
}
