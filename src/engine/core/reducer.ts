import type { GameEvent, GameState } from '../contracts/index.js';
import { hashCanonical } from './hash.js';

export class EngineInvariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineInvariantError';
    this.code = code;
  }
}

function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EngineInvariantError(code, message);
}

/**
 * The only function allowed to produce a new canonical state. It validates
 * ordering and provenance, then applies exactly one event. It never reads a
 * clock, a renderer, a model or a database.
 */
export function reduceGameState(state: GameState, event: GameEvent): GameState {
  invariant(event.sessionId === state.sessionId, 'session_mismatch', 'event belongs to another session');
  invariant(event.branchId === state.branchId, 'branch_mismatch', 'event belongs to another branch');
  invariant(
    event.stateVersion === state.stateVersion + 1,
    'stale_event',
    `expected state version ${state.stateVersion + 1}, received ${event.stateVersion}`,
  );
  invariant(
    event.sequenceNo === event.stateVersion,
    'sequence_mismatch',
    'sequenceNo must equal stateVersion in Stage 3',
  );

  const base: GameState = {
    ...state,
    stateVersion: event.stateVersion,
    lastEventId: event.eventId,
  };

  switch (event.type) {
    case 'session.started': {
      invariant(state.stateVersion === 0, 'duplicate_start', 'session already started');
      invariant(event.tick === 0, 'invalid_tick', 'session must start at tick 0');
      invariant(
        event.payload.contentId === state.contentId &&
          event.payload.gameVersion === state.gameVersion &&
          event.payload.seed === state.seed,
        'content_mismatch',
        'session.started payload does not match state content',
      );
      return base;
    }

    case 'tick.advanced': {
      invariant(
        event.payload.fromTick === state.tick,
        'invalid_tick',
        'tick.advanced fromTick does not match current tick',
      );
      invariant(
        event.payload.toTick >= state.tick,
        'invalid_tick',
        'tick cannot move backwards',
      );
      invariant(
        event.tick === event.payload.toTick,
        'invalid_tick',
        'event tick must equal the new tick',
      );
      return { ...base, tick: event.payload.toTick };
    }

    case 'fact.asserted': {
      const { fact } = event.payload;
      invariant(event.tick === state.tick, 'invalid_tick', 'facts are asserted at the current tick');
      invariant(fact.sourceEventId === event.eventId, 'provenance_mismatch', 'fact source event mismatch');
      invariant(fact.branchId === state.branchId, 'branch_mismatch', 'fact belongs to another branch');
      invariant(fact.acquiredAtTick === state.tick, 'invalid_tick', 'fact tick does not match state tick');
      invariant(
        !Object.values(state.facts).some((existing) => existing.factId === fact.factId),
        'duplicate_fact',
        'fact id already exists',
      );

      const isNewKey = state.facts[fact.key] === undefined;
      const isEvidence = fact.key.startsWith('evidence.');
      return {
        ...base,
        facts: { ...state.facts, [fact.key]: fact },
        player:
          isNewKey && isEvidence
            ? {
                ...state.player,
                progress: {
                  ...state.player.progress,
                  evidenceFound: state.player.progress.evidenceFound + 1,
                },
              }
            : state.player,
      };
    }

    case 'choice.made': {
      const { choice } = event.payload;
      invariant(choice.sourceEventId === event.eventId, 'provenance_mismatch', 'choice source event mismatch');
      invariant(
        choice.sessionId === state.sessionId && choice.branchId === state.branchId,
        'scope_mismatch',
        'choice is out of scope for this branch',
      );
      invariant(
        !state.choices.some((existing) => existing.choiceId === choice.choiceId),
        'duplicate_choice',
        'choice id already exists',
      );
      return {
        ...base,
        choices: [...state.choices, choice],
        player: {
          ...state.player,
          progress: {
            ...state.player.progress,
            choicesMade: state.player.progress.choicesMade + 1,
          },
        },
      };
    }

    case 'rule.evaluated': {
      invariant(event.tick === state.tick, 'invalid_tick', 'rule evaluation must use the current tick');
      return base;
    }

    case 'anchor.recorded': {
      const { anchor } = event.payload;
      invariant(event.tick === state.tick, 'invalid_tick', 'anchor must use the current tick');
      invariant(anchor.sourceEventId === event.eventId, 'provenance_mismatch', 'anchor source event mismatch');
      invariant(
        anchor.sessionId === state.sessionId && anchor.branchId === state.branchId,
        'scope_mismatch',
        'anchor is out of scope for this branch',
      );
      invariant(
        anchor.stateVersion === state.stateVersion,
        'stale_anchor',
        'anchor must checkpoint the pre-event state version',
      );
      invariant(
        anchor.eventSequenceNo === event.sequenceNo,
        'stale_anchor',
        'anchor sequence must match the recording event',
      );
      invariant(
        anchor.stateHash === hashCanonical(state),
        'anchor_hash_mismatch',
        'anchor state hash does not match the checkpointed state',
      );
      invariant(
        !state.anchors.some((existing) => existing.anchorId === anchor.anchorId),
        'duplicate_anchor',
        'anchor id already exists',
      );
      return {
        ...base,
        anchors: [...state.anchors, anchor],
        player: {
          ...state.player,
          progress: {
            ...state.player.progress,
            anchorsReached: state.player.progress.anchorsReached + 1,
          },
        },
      };
    }

    case 'branch.forked': {
      const { branch, fromAnchorId } = event.payload;
      invariant(event.tick === state.tick, 'invalid_tick', 'fork must use the current tick');
      invariant(branch.sessionId === state.sessionId, 'scope_mismatch', 'branch belongs to another session');
      invariant(
        branch.parentBranchId === state.branchId,
        'branch_mismatch',
        'forked branch must descend from the current branch',
      );
      invariant(
        branch.forkedAtAnchorId === fromAnchorId,
        'branch_mismatch',
        'fork metadata does not match fromAnchorId',
      );
      const anchor = state.anchors.find((candidate) => candidate.anchorId === fromAnchorId);
      invariant(anchor !== undefined, 'unknown_target', 'fork anchor does not exist');
      invariant(anchor.safe, 'policy_denied', 'unsafe anchors cannot be forked');
      invariant(
        branch.forkedAtStateVersion === anchor.stateVersion,
        'stale_anchor',
        'fork must start at the anchor checkpoint version',
      );
      invariant(
        branch.forkedAtTick === anchor.tick,
        'invalid_tick',
        'fork tick must equal the anchor checkpoint tick',
      );
      invariant(
        branch.forkedAtEventSequenceNo === anchor.eventSequenceNo,
        'stale_anchor',
        'fork must record the anchor event position',
      );
      invariant(
        branch.forkedAtStateHash === anchor.stateHash,
        'anchor_hash_mismatch',
        'fork must record the anchor checkpoint hash',
      );
      invariant(
        anchor.stateVersion <= state.stateVersion,
        'stale_anchor',
        'fork checkpoint cannot be in the future',
      );
      invariant(
        branch.timelineIndex === state.branches.length,
        'branch_mismatch',
        'timeline index must be sequential',
      );
      invariant(
        !state.branches.some((existing) => existing.branchId === branch.branchId),
        'duplicate_branch',
        'branch id already exists',
      );
      return { ...base, branches: [...state.branches, branch] };
    }

    case 'npc.proposal.evaluated': {
      invariant(event.tick === state.tick, 'invalid_tick', 'proposal must use the current tick');
      return base;
    }

    case 'morrow.proposal.evaluated': {
      invariant(event.tick === state.tick, 'invalid_tick', 'MORROW proposal must use the current tick');
      return base;
    }

    case 'morrow.intervened': {
      invariant(event.tick === state.tick, 'invalid_tick', 'MORROW intervention must use the current tick');
      return base;
    }

    case 'ending.reached': {
      invariant(event.tick === state.tick, 'invalid_tick', 'ending must use the current tick');
      invariant(
        state.endingId === null || state.endingId === event.payload.endingId,
        'ending_conflict',
        'a different ending is already committed on this branch',
      );
      return { ...base, endingId: event.payload.endingId };
    }

    case 'action.rejected': {
      invariant(event.tick === state.tick, 'invalid_tick', 'rejection must use the current tick');
      return base;
    }

    default: {
      const exhaustive: never = event;
      throw new EngineInvariantError('unknown_event', `unhandled event ${String(exhaustive)}`);
    }
  }
}
