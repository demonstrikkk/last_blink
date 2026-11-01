import {
  type ActionResult,
  type BranchId,
  type GameEventId,
  type MorrowObservation,
  type MorrowPolicy,
  type MorrowProposal,
  morrowProposalSchema,
} from '../contracts/index.js';
import type { GameSession } from '../session/gameSession.js';
import type { ClockPort } from '../session/ports.js';
import { buildMorrowObservation } from './observation.js';
import { createDeterministicMorrowPolicy } from './policy.js';

export interface MorrowTurn {
  readonly observation: MorrowObservation;
  readonly proposal: MorrowProposal;
  readonly result: ActionResult;
  readonly fallback: boolean;
  readonly triggerEventId: GameEventId | null;
}

export interface MorrowRunOptions {
  readonly triggerEventId?: GameEventId | null;
  /** Bypass the posture-hold guard; used by tests and operator tooling. */
  readonly force?: boolean;
}

export interface MorrowControllerOptions {
  readonly policy?: MorrowPolicy;
  readonly fallbackPolicy?: MorrowPolicy;
  readonly clock?: ClockPort;
  /** Optional server-side model bridge. The deterministic policy remains the fallback. */
  readonly model?: MorrowModelPort;
}

export interface MorrowModelPort {
  propose(observation: MorrowObservation): Promise<MorrowProposal>;
}

const SYSTEM_CLOCK: ClockPort = { nowIso: () => new Date().toISOString() };

/**
 * Runtime coordinator for MORROW. It observes, asks a policy for a proposal and
 * submits that proposal through GameSession.dispatch. It never writes state and
 * never reads another branch's events.
 */
export class MorrowController {
  private readonly policy: MorrowPolicy;
  private readonly fallbackPolicy: MorrowPolicy;
  private readonly clock: ClockPort;
  private readonly model: MorrowModelPort | undefined;
  private readonly lastObservation = new Map<string, string>();
  private readonly session: GameSession;

  constructor(
    session: GameSession,
    options: MorrowControllerOptions = {},
  ) {
    this.session = session;
    this.policy = options.policy ?? createDeterministicMorrowPolicy();
    this.fallbackPolicy = options.fallbackPolicy ?? createDeterministicMorrowPolicy();
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.model = options.model;
  }

  observe(triggerEventId: GameEventId | null = null): MorrowObservation {
    return buildMorrowObservation(this.session, {
      triggerEventId,
      nowIso: () => this.clock.nowIso(),
    });
  }

  plan(triggerEventId: GameEventId | null = null): {
    observation: MorrowObservation;
    proposal: MorrowProposal;
    fallback: boolean;
  } {
    const observation = this.observe(triggerEventId);
    let fallback = false;
    let proposal: MorrowProposal;

    try {
      proposal = morrowProposalSchema.parse(this.policy.propose(observation));
    } catch {
      fallback = true;
      proposal = morrowProposalSchema.parse(this.fallbackPolicy.propose(observation));
    }

    return { observation, proposal, fallback };
  }

  run(options: MorrowRunOptions = {}): MorrowTurn | null {
    const observation = this.observe(options.triggerEventId ?? null);
    const branchKey = String(observation.branchId);
    if (!options.force && this.lastObservation.get(branchKey) === observation.observationHash) {
      return null;
    }
    this.lastObservation.set(branchKey, observation.observationHash);

    let fallback = false;
    let proposal: MorrowProposal;
    try {
      proposal = morrowProposalSchema.parse(this.policy.propose(observation));
    } catch {
      fallback = true;
      proposal = morrowProposalSchema.parse(this.fallbackPolicy.propose(observation));
    }

    // A policy that wants to keep the current posture is not a new
    // intervention. Skipping avoids writing no-op facts on every tick.
    if (
      !options.force &&
      observation.features.lastResponse !== null &&
      proposal.response === observation.features.lastResponse
    ) {
      return null;
    }

    const result = this.session.dispatch({
      actionType: 'morrow.intervene',
      actorId: 'system_morrow',
      params: {
        proposalId: proposal.proposalId,
        policyId: proposal.policyId,
        policyVersion: proposal.policyVersion,
        observationId: proposal.observationId,
        observationHash: proposal.observationHash,
        basedOnStateVersion: proposal.basedOnStateVersion,
        response: proposal.response,
        reasonCodes: proposal.reasonCodes,
      },
    });

    return {
      observation,
      proposal,
      result,
      fallback,
      triggerEventId: observation.triggerEventId,
    };
  }

  async runAsync(options: MorrowRunOptions = {}): Promise<MorrowTurn | null> {
    if (!this.model) return this.run(options);
    const observation = this.observe(options.triggerEventId ?? null);
    const branchKey = String(observation.branchId);
    if (!options.force && this.lastObservation.get(branchKey) === observation.observationHash) return null;
    this.lastObservation.set(branchKey, observation.observationHash);

    let proposal: MorrowProposal;
    let fallback = false;
    try {
      proposal = morrowProposalSchema.parse(await this.model.propose(observation));
    } catch {
      fallback = true;
      proposal = morrowProposalSchema.parse(this.fallbackPolicy.propose(observation));
    }
    if (
      !options.force &&
      observation.features.lastResponse !== null &&
      proposal.response === observation.features.lastResponse
    ) return null;
    const result = this.session.dispatch({
      actionType: 'morrow.intervene',
      actorId: 'system_morrow',
      params: {
        proposalId: proposal.proposalId,
        policyId: proposal.policyId,
        policyVersion: proposal.policyVersion,
        observationId: proposal.observationId,
        observationHash: proposal.observationHash,
        basedOnStateVersion: proposal.basedOnStateVersion,
        response: proposal.response,
        reasonCodes: proposal.reasonCodes,
      },
    });
    return { observation, proposal, result, fallback, triggerEventId: observation.triggerEventId };
  }

  /** Forget the posture guard for a branch, e.g. after switching timelines. */
  reset(branchId?: BranchId): void {
    if (branchId) this.lastObservation.delete(String(branchId));
    else this.lastObservation.clear();
  }
}
