import type { GameState, Rejection } from '../contracts/index.js';
import { anchorIdSchema } from '../contracts/index.js';
import type { GameContent } from '../content/stage3Content.js';
import {
  advanceTickParamsSchema,
  anchorParamsSchema,
  choiceMakeParamsSchema,
  evidenceCollectParamsSchema,
  factAssertParamsSchema,
  forkParamsSchema,
  gameActionSchema,
  morrowInterveneParamsSchema,
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

    default: {
      const exhaustive: never = action.actionType;
      return fail('unknown_action', `unknown action type ${String(exhaustive)}`);
    }
  }
}
