import {
  CONTRACT_NAMES,
  CONTRACT_VERSION,
  CONTRACT_VERSIONS,
  SAVE_FORMAT_VERSION,
  actionResultSchema,
  actionTypeSchema,
  actorIdSchema,
  factKeySchema,
  gameEventSchema,
  saveEnvelopeSchema,
  type ActionResult,
  type ActionId,
  type ActionRejectedEvent,
  type ActionType,
  type ActorId,
  type Anchor,
  type AnchorRecordedEvent,
  type Branch,
  type BranchForkedEvent,
  type BranchId,
  type Choice,
  type ChoiceMadeEvent,
  type EndingReachedEvent,
  type Fact,
  type FactAssertedEvent,
  type GameEvent,
  type GameEventId,
  type GameState,
  type JsonObject,
  type JsonValue,
  type MorrowIntervenedEvent,
  type MorrowProposalEvaluatedEvent,
  type MorrowResponse,
  type NpcProposalEvaluatedEvent,
  type PlayerProfile,
  type RuleEvaluatedEvent,
  type SaveEnvelope,
  type SessionId,
  type SessionStartedEvent,
  type SourceId,
  type TickAdvancedEvent,
} from '../contracts/index.js';
import { morrowEscalationOf, nextMorrowEscalation } from '../morrow/fairness.js';
import {
  morrowInterveneParamsSchema,
  npcProposeParamsSchema,
  type ParsedAction,
} from '../core/actions.js';
import { hashCanonical } from '../core/hash.js';
import { createDeterministicIdFactory, type IdFactory } from '../core/ids.js';
import { reduceGameState } from '../core/reducer.js';
import { evaluateRules } from '../core/rules.js';
import { validateAction, type RejectionCode } from '../core/validation.js';
import {
  ancestryChain,
  collectScars,
  compareBranchStates,
  lineageEvents,
  rebaseState,
  summariseBranch,
  type BranchComparison,
  type BranchRuntimeView,
  type BranchSummary,
} from './branching.js';
import type { GameContent } from '../content/stage3Content.js';
import type {
  ClockPort,
  ContentPort,
  GamePolicyPort,
  LoggerPort,
  PersistencePort,
} from './ports.js';

export interface GameSnapshot {
  readonly state: GameState;
  readonly hash: string;
  readonly revision: number;
}

export interface BranchSwitchResult {
  readonly status: 'switched' | 'rejected';
  readonly branchId: BranchId;
  readonly stateHash: string;
  readonly stateVersion: number;
  readonly code: 'unknown_branch' | 'already_active' | 'stale_snapshot' | 'hash_mismatch' | null;
  readonly message: string | null;
}

export interface ForkTimelineResult {
  readonly result: ActionResult;
  readonly branchId: BranchId | null;
}


export interface GameSessionDeps {
  readonly clock: ClockPort;
  readonly policy: GamePolicyPort;
  readonly persistence: PersistencePort;
  readonly content: ContentPort;
  readonly logger: LoggerPort;
}

export interface CreateSessionOptions {
  readonly sessionId: SessionId;
  readonly player: PlayerProfile;
  readonly seed: string;
  readonly contentId?: string;
}

/**
 * The one interface every other component talks to. Rendering, tests, tools and
 * future agents all use this; nothing reaches into the reducer directly.
 */
export interface GameSession {
  readonly sessionId: SessionId;
  getState(): GameState;
  getSnapshot(): GameSnapshot;
  getRecentEvents(limit?: number): readonly GameEvent[];
  getLineageEvents(branchId?: BranchId): readonly GameEvent[];
  listBranches(): readonly BranchSummary[];
  getBranchState(branchId: BranchId): GameState | null;
  getBranchHash(branchId: BranchId): string | null;
  getActiveBranchId(): BranchId;
  switchBranch(branchId: BranchId): BranchSwitchResult;
  compareBranches(baseId: BranchId, otherId: BranchId): BranchComparison;
  dispatch(action: unknown): ActionResult;
  advanceTick(ticks?: number): ActionResult;
  recordAnchor(label: string): ActionResult;
  forkBranch(anchorId: string, label?: string): ActionResult;
  forkTimeline(anchorId: string, label?: string): ForkTimelineResult;
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
  save(): Promise<SaveEnvelope>;
}

interface BranchRuntime {
  readonly branch: Branch;
  state: GameState;
  hash: string;
  readonly history: GameState[];
  readonly events: GameEvent[];
}

interface EventEnvelope {
  schemaVersion: typeof CONTRACT_VERSION;
  eventId: GameEventId;
  sessionId: SessionId;
  branchId: BranchId;
  sequenceNo: number;
  stateVersion: number;
  tick: number;
  actorId: ActorId;
  sourceId: SourceId;
  actionId: ActionId | null;
  occurredAt: string;
  idempotencyKey: string;
}

const SYSTEM_ACTOR = 'system_engine' as ActorId;
const PLAYER_ACTOR = 'player_local' as ActorId;
const MORROW_ACTOR = 'system_morrow' as ActorId;
const MAX_RECENT_EVENTS = 50;

interface MorrowRejectionContext {
  readonly proposalId: NonNullable<MorrowProposalEvaluatedEvent['payload']['proposalId']>;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly observationId: MorrowProposalEvaluatedEvent['payload']['observationId'];
  readonly response: MorrowResponse;
  readonly reasonCodes: readonly string[];
}

function morrowRejectionContext(raw: unknown): MorrowRejectionContext | null {
  const parsed = morrowInterveneParamsSchema.safeParse(rawField(raw, 'params'));
  if (!parsed.success) return null;
  return {
    proposalId: parsed.data.proposalId,
    policyId: parsed.data.policyId,
    policyVersion: parsed.data.policyVersion,
    observationId: parsed.data.observationId,
    response: parsed.data.response,
    reasonCodes: parsed.data.reasonCodes,
  };
}

interface NpcRejectionContext {
  readonly proposalId: NonNullable<NpcProposalEvaluatedEvent['payload']['proposalId']>;
  readonly npcId: NpcProposalEvaluatedEvent['payload']['npcId'];
}

function npcRejectionContext(raw: unknown): NpcRejectionContext | null {
  const parsed = npcProposeParamsSchema.safeParse(rawField(raw, 'params'));
  if (!parsed.success) return null;
  return {
    proposalId: parsed.data.proposal.proposalId,
    npcId: parsed.data.proposal.npcId,
  };
}

function sourceForActor(actorId: ActorId): SourceId {
  if (actorId.startsWith('player_')) return 'input.player' as SourceId;
  if (actorId.startsWith('npc_')) return 'policy.npc' as SourceId;
  return 'engine.core' as SourceId;
}

function rawField(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function saveChecksum(save: Omit<SaveEnvelope, 'checksum'>): string {
  return hashCanonical({
    saveFormatVersion: save.saveFormatVersion,
    saveId: save.saveId,
    gameVersion: save.gameVersion,
    sessionId: save.sessionId,
    savedAt: save.savedAt,
    engineStateHash: save.engineStateHash,
    contractVersions: save.contractVersions,
    payload: save.payload,
  });
}

export class DeterministicGameSession implements GameSession {
  readonly sessionId: SessionId;

  private state: GameState;
  private snapshot: GameSnapshot;
  private readonly runtimes = new Map<BranchId, BranchRuntime>();
  private readonly listeners = new Set<(snapshot: GameSnapshot) => void>();
  private readonly ids: IdFactory;
  private readonly content: GameContent;

  private constructor(
    private readonly deps: GameSessionDeps,
    content: GameContent,
    state: GameState,
    ids: IdFactory,
    initialEvents: readonly GameEvent[] = [],
  ) {
    this.content = content;
    this.sessionId = state.sessionId;
    this.state = state;
    this.ids = ids;
    const history: GameState[] = [];
    history[state.stateVersion] = state;
    const root: BranchRuntime = {
      branch: state.branches.find((branch) => branch.branchId === state.branchId) as Branch,
      state,
      hash: hashCanonical(state),
      history,
      events: [...initialEvents],
    };
    this.runtimes.set(state.branchId, root);
    this.snapshot = { state, hash: root.hash, revision: 0 };
  }

  static async create(
    options: CreateSessionOptions,
    deps: GameSessionDeps,
  ): Promise<DeterministicGameSession> {
    const content = await deps.content.load();
    if (options.contentId !== undefined && options.contentId !== content.contentId) {
      throw new Error(`content id mismatch: requested ${options.contentId}, loaded ${content.contentId}`);
    }

    const ids = createDeterministicIdFactory(`${options.sessionId}:${options.seed}`);
    const createdAt = deps.clock.nowIso();
    const branchId = ids.next('brn_') as BranchId;
    const branch: Branch = {
      schemaVersion: CONTRACT_VERSION,
      branchId,
      sessionId: options.sessionId,
      parentBranchId: null,
      forkedAtAnchorId: null,
      forkedAtTick: null,
      forkedAtStateVersion: null,
      forkedAtEventSequenceNo: null,
      forkedAtStateHash: null,
      label: 'Original timeline',
      status: 'active',
      timelineIndex: 0,
      createdAt,
    };

    const state: GameState = {
      schemaVersion: CONTRACT_VERSION,
      sessionId: options.sessionId,
      branchId,
      stateVersion: 0,
      tick: 0,
      contentId: content.contentId,
      gameVersion: content.gameVersion,
      seed: options.seed,
      facts: {},
      choices: [],
      anchors: [],
      branches: [branch],
      player: options.player,
      endingId: null,
      lastEventId: null,
      rngCursor: 0,
    };

    const session = new DeterministicGameSession(deps, content, state, ids);
    session.emitInitialEvents(content.initialFacts);
    return session;
  }

  static async restore(
    envelope: unknown,
    deps: GameSessionDeps,
  ): Promise<DeterministicGameSession> {
    const parsed = saveEnvelopeSchema.parse(envelope);

    for (const name of CONTRACT_NAMES) {
      if (parsed.contractVersions[name] !== CONTRACT_VERSIONS[name]) {
        throw new Error(
          `save contract ${name} is ${String(parsed.contractVersions[name])}, expected ${CONTRACT_VERSIONS[name]}`,
        );
      }
    }
    for (const name of Object.keys(parsed.contractVersions)) {
      if (!(CONTRACT_NAMES as readonly string[]).includes(name)) {
        throw new Error(`save contains unknown contract ${name}`);
      }
    }
    if (saveChecksum(parsed) !== parsed.checksum) {
      throw new Error('save checksum mismatch');
    }
    if (hashCanonical(parsed.payload) !== parsed.engineStateHash) {
      throw new Error('save state hash mismatch');
    }

    const content = await deps.content.load();
    if (
      content.contentId !== parsed.payload.contentId ||
      content.gameVersion !== parsed.payload.gameVersion
    ) {
      throw new Error('save was produced by different content');
    }

    const ids = createDeterministicIdFactory(
      `${parsed.payload.sessionId}:${parsed.payload.seed}:restore:${parsed.payload.stateVersion}`,
    );
    return new DeterministicGameSession(deps, content, parsed.payload, ids);
  }

  getState(): GameState {
    return this.state;
  }

  getSnapshot(): GameSnapshot {
    return this.snapshot;
  }

  getRecentEvents(limit = 20): readonly GameEvent[] {
    const size = Math.max(0, Math.min(limit, MAX_RECENT_EVENTS));
    const events = this.activeEvents();
    return events.slice(Math.max(0, events.length - size));
  }

  /** All events on the active timeline, ancestry first. */
  getLineageEvents(branchId: BranchId = this.state.branchId): readonly GameEvent[] {
    const runtime = this.requireRuntime(branchId);
    return lineageEvents(runtime.branch, this.chainFor(runtime.branch), this.logs());
  }

  listBranches(): readonly BranchSummary[] {
    return [...this.runtimes.values()]
      .map((runtime) =>
        summariseBranch(this.view(runtime), this.chainFor(runtime.branch), this.logs()),
      )
      .sort((a, b) => a.timelineIndex - b.timelineIndex);
  }

  getBranchState(branchId: BranchId): GameState | null {
    return this.runtimes.get(branchId)?.state ?? null;
  }

  getBranchHash(branchId: BranchId): string | null {
    return this.runtimes.get(branchId)?.hash ?? null;
  }

  getActiveBranchId(): BranchId {
    return this.state.branchId;
  }

  /**
   * Switch the active timeline. A switch never writes to either timeline: the
   * target state was committed when its branch last acted, so restoring it is a
   * pointer move. Failures leave the active snapshot exactly as it was.
   */
  switchBranch(branchId: BranchId): BranchSwitchResult {
    const reject = (
      code: NonNullable<BranchSwitchResult['code']>,
      message: string,
    ): BranchSwitchResult => ({
      status: 'rejected',
      branchId,
      stateHash: this.snapshot.hash,
      stateVersion: this.state.stateVersion,
      code,
      message,
    });

    if (branchId === this.state.branchId) {
      return reject('already_active', 'that timeline is already active');
    }

    const runtime = this.runtimes.get(branchId);
    if (!runtime) {
      const known = this.state.branches.some((branch) => branch.branchId === branchId);
      return known
        ? reject('stale_snapshot', 'this timeline has no retained snapshot in this session')
        : reject('unknown_branch', 'no timeline with that id exists in this session');
    }
    const recomputed = hashCanonical(runtime.state);
    if (recomputed !== runtime.hash) {
      return reject('stale_snapshot', 'the retained snapshot no longer matches its recorded hash');
    }

    this.state = runtime.state;
    this.snapshot = {
      state: runtime.state,
      hash: runtime.hash,
      revision: this.snapshot.revision + 1,
    };
    this.deps.logger.info('timeline switched', {
      sessionId: this.sessionId,
      branchId,
      stateVersion: runtime.state.stateVersion,
    });
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch (error) {
        this.deps.logger.error('session listener failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      status: 'switched',
      branchId,
      stateHash: runtime.hash,
      stateVersion: runtime.state.stateVersion,
      code: null,
      message: null,
    };
  }

  /** Compare two timelines using canonical states and event logs only. */
  compareBranches(baseId: BranchId, otherId: BranchId): BranchComparison {
    const base = this.requireRuntime(baseId);
    const other = this.requireRuntime(otherId);
    const baseChain = this.chainFor(base.branch);
    const otherChain = this.chainFor(other.branch);
    return compareBranchStates(this.view(base), this.view(other), {
      baseChain,
      otherChain,
      baseEvents: lineageEvents(base.branch, baseChain, this.logs()),
      otherEvents: lineageEvents(other.branch, otherChain, this.logs()),
      logs: this.logs(),
    });
  }

  subscribe(listener: (snapshot: GameSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  advanceTick(ticks = 1): ActionResult {
    return this.dispatch({ actionType: 'session.advance_tick', actorId: PLAYER_ACTOR, params: { ticks } });
  }

  recordAnchor(label: string): ActionResult {
    return this.dispatch({ actionType: 'anchor.record', actorId: PLAYER_ACTOR, params: { label } });
  }

  forkBranch(anchorId: string, label = 'Forked timeline'): ActionResult {
    return this.dispatch({
      actionType: 'branch.fork',
      actorId: PLAYER_ACTOR,
      params: { anchorId, label },
    });
  }

  /** Fork and report the new branch id so the caller can switch to it. */
  forkTimeline(anchorId: string, label = 'Forked timeline'): ForkTimelineResult {
    const before = new Set(this.state.branches.map((branch) => branch.branchId));
    const result = this.forkBranch(anchorId, label);
    const created = this.state.branches.find((branch) => !before.has(branch.branchId));
    return { result, branchId: result.status === 'accepted' ? (created?.branchId ?? null) : null };
  }

  dispatch(raw: unknown): ActionResult {
    const actionId = this.ids.next('act_') as ActionId;
    const validation = validateAction(this.state, raw, this.content);

    if (!validation.ok) {
      return this.reject(raw, actionId, validation.code, validation.message, validation.details);
    }

    const action = validation.action;
    const verdict = this.deps.policy.evaluate({ action, state: this.state });
    if (!verdict.allowed) {
      return this.reject(raw, actionId, 'policy_denied', verdict.message ?? 'policy denied', {
        policyCode: verdict.code ?? 'policy_denied',
      });
    }

    if (action.actionType === 'npc.propose') {
      const proposal = action.params.proposal;
      const evaluated = this.getLineageEvents().filter(
        (event): event is NpcProposalEvaluatedEvent =>
          event.type === 'npc.proposal.evaluated' &&
          event.branchId === this.state.branchId,
      );
      if (evaluated.some((event) => event.payload.proposalId === proposal.proposalId)) {
        return this.reject(raw, actionId, 'duplicate', 'this proposal has already been evaluated', {
          proposalId: proposal.proposalId,
        });
      }
      if (
        evaluated.some(
          (event) =>
            event.payload.npcId === proposal.npcId && event.tick === this.state.tick,
        )
      ) {
        return this.reject(
          raw,
          actionId,
          'duplicate',
          'this NPC has already made a proposal this tick',
          { npcId: proposal.npcId, tick: this.state.tick },
        );
      }
    }

    const source = sourceForActor(action.actorId);
    const produced: GameEventId[] = [];
    let state = this.state;

    switch (action.actionType) {
      case 'session.noop':
        break;

      case 'session.advance_tick': {
        const eventId = this.ids.next('evt_') as GameEventId;
        const toTick = state.tick + action.params.ticks;
        const event: TickAdvancedEvent = {
          ...this.envelope(state, eventId, toTick, action.actorId, source, actionId),
          type: 'tick.advanced',
          payload: { fromTick: state.tick, toTick, reason: 'manual' },
        };
        state = this.apply(state, event);
        produced.push(eventId);
        const ruled = this.runRules(state, actionId);
        state = ruled.state;
        produced.push(...ruled.eventIds);
        break;
      }

      case 'fact.assert': {
        const eventId = this.ids.next('evt_') as GameEventId;
        const fact: Fact = {
          schemaVersion: CONTRACT_VERSION,
          factId: this.ids.next('fct_') as Fact['factId'],
          key: action.params.key,
          value: action.params.value,
          kind: action.params.kind,
          confidence: 1,
          sourceEventId: eventId,
          branchId: state.branchId,
          acquiredAtTick: state.tick,
          source: { kind: 'system', ref: action.params.sourceRef },
        };
        const event: FactAssertedEvent = {
          ...this.envelope(state, eventId, state.tick, action.actorId, source, actionId),
          type: 'fact.asserted',
          payload: { fact },
        };
        state = this.apply(state, event);
        produced.push(eventId);
        const ruled = this.runRules(state, actionId);
        state = ruled.state;
        produced.push(...ruled.eventIds);
        break;
      }

      case 'anchor.record': {
        const eventId = this.ids.next('evt_') as GameEventId;
        const anchor: Anchor = {
          schemaVersion: CONTRACT_VERSION,
          anchorId: this.ids.next('anc_') as Anchor['anchorId'],
          sessionId: state.sessionId,
          branchId: state.branchId,
          label: action.params.label,
          tick: state.tick,
          stateVersion: state.stateVersion,
          stateHash: hashCanonical(state),
          eventSequenceNo: state.stateVersion + 1,
          safe: true,
          sourceEventId: eventId,
          createdAt: this.deps.clock.nowIso(),
        };
        const event: AnchorRecordedEvent = {
          ...this.envelope(state, eventId, state.tick, action.actorId, source, actionId),
          type: 'anchor.recorded',
          payload: { anchor },
        };
        state = this.apply(state, event);
        produced.push(eventId);
        break;
      }

      case 'branch.fork': {
        const anchor = state.anchors.find((candidate) => candidate.anchorId === action.params.anchorId);
        if (!anchor) throw new Error('validated fork anchor disappeared');
        const parentRuntime = this.requireRuntime(state.branchId);
        const checkpoint = parentRuntime.history[anchor.stateVersion];
        if (!checkpoint || hashCanonical(checkpoint) !== anchor.stateHash) {
          return this.reject(raw, actionId, 'stale_state', 'the anchor checkpoint is not retained', {
            anchorId: anchor.anchorId,
          });
        }

        const eventId = this.ids.next('evt_') as GameEventId;
        const branch: Branch = {
          schemaVersion: CONTRACT_VERSION,
          branchId: this.ids.next('brn_') as BranchId,
          sessionId: state.sessionId,
          parentBranchId: state.branchId,
          forkedAtAnchorId: anchor.anchorId,
          forkedAtTick: anchor.tick,
          forkedAtStateVersion: anchor.stateVersion,
          forkedAtEventSequenceNo: anchor.eventSequenceNo,
          forkedAtStateHash: anchor.stateHash,
          label: action.params.label,
          status: 'active',
          timelineIndex: state.branches.length,
          createdAt: this.deps.clock.nowIso(),
        };
        const event: BranchForkedEvent = {
          ...this.envelope(state, eventId, state.tick, action.actorId, source, actionId),
          type: 'branch.forked',
          payload: { branch, fromAnchorId: anchor.anchorId },
        };
        state = this.apply(state, event);
        produced.push(eventId);

        this.createChildRuntime(parentRuntime, branch, anchor.stateVersion, state, actionId);
        break;
      }

      case 'evidence.collect': {
        const definition = this.content.evidence.find(
          (candidate) => candidate.evidenceId === action.params.evidenceId,
        );
        if (!definition) throw new Error('validated evidence definition disappeared');

        const asserted = this.assertFact(state, actionId, action.actorId, source, {
          key: definition.factKey,
          value: definition.value,
          kind: 'observed',
          sourceRef: definition.sourceRef,
          sourceKind: definition.sourceKind,
          confidence: definition.confidence,
        });
        state = asserted.state;
        produced.push(asserted.eventId);
        const ruled = this.runRules(state, actionId);
        state = ruled.state;
        produced.push(...ruled.eventIds);
        break;
      }

      case 'choice.make': {
        const node = this.content.choices.find(
          (candidate) => candidate.nodeId === action.params.nodeId,
        );
        if (!node) throw new Error('validated choice node disappeared');
        const option = node.options.find(
          (candidate) => candidate.optionId === action.params.optionId,
        );
        if (!option) throw new Error('validated choice option disappeared');

        const choiceEventId = this.ids.next('evt_') as GameEventId;
        const choice: Choice = {
          schemaVersion: CONTRACT_VERSION,
          choiceId: this.ids.next('cho_') as Choice['choiceId'],
          sessionId: state.sessionId,
          branchId: state.branchId,
          nodeId: node.nodeId,
          optionId: option.optionId,
          madeAtTick: state.tick,
          sourceEventId: choiceEventId,
          consequenceKeys: option.consequenceKeys,
        };
        const choiceEvent: ChoiceMadeEvent = {
          ...this.envelope(state, choiceEventId, state.tick, action.actorId, source, actionId),
          type: 'choice.made',
          payload: { choice },
        };
        state = this.apply(state, choiceEvent);
        produced.push(choiceEventId);

        for (const effect of option.effects) {
          const asserted = this.assertFact(state, actionId, action.actorId, source, {
            key: effect.key,
            value: effect.value,
            kind: 'asserted',
            sourceRef: `choice.${node.nodeId}.${option.optionId}`,
            sourceKind: 'system',
            confidence: 1,
          });
          state = asserted.state;
          produced.push(asserted.eventId);
        }

        const ruled = this.runRules(state, actionId);
        state = ruled.state;
        produced.push(...ruled.eventIds);
        break;
      }

      case 'morrow.intervene': {
        const proposal = action.params;
        const evaluatedEventId = this.ids.next('evt_') as GameEventId;
        const evaluated: MorrowProposalEvaluatedEvent = {
          ...this.envelope(
            state,
            evaluatedEventId,
            state.tick,
            action.actorId,
            'policy.morrow' as SourceId,
            actionId,
          ),
          type: 'morrow.proposal.evaluated',
          payload: {
            proposalId: proposal.proposalId,
            policyId: proposal.policyId,
            policyVersion: proposal.policyVersion,
            observationId: proposal.observationId,
            response: proposal.response,
            status: 'accepted',
            reasonCodes: [...proposal.reasonCodes],
            reason: null,
          },
        };
        state = this.apply(state, evaluated);
        produced.push(evaluatedEventId);

        const escalation = nextMorrowEscalation(
          morrowEscalationOf(state),
          proposal.response,
        );
        const intervenedEventId = this.ids.next('evt_') as GameEventId;
        const intervened: MorrowIntervenedEvent = {
          ...this.envelope(
            state,
            intervenedEventId,
            state.tick,
            action.actorId,
            'policy.morrow' as SourceId,
            actionId,
          ),
          type: 'morrow.intervened',
          payload: {
            proposalId: proposal.proposalId,
            policyId: proposal.policyId,
            policyVersion: proposal.policyVersion,
            response: proposal.response,
            reasonCodes: [...proposal.reasonCodes],
            escalation,
          },
        };
        state = this.apply(state, intervened);
        produced.push(intervenedEventId);

        for (const [key, value] of [
          ['morrow.response', proposal.response],
          ['morrow.last_proposal', proposal.proposalId],
          ['morrow.escalation', escalation],
        ] as const) {
          const asserted = this.assertFact(state, actionId, action.actorId, source, {
            key: key as Fact['key'],
            value,
            kind: 'derived',
            sourceRef: `morrow.policy:${proposal.policyId}`,
            sourceKind: 'derived',
            confidence: 1,
          });
          state = asserted.state;
          produced.push(asserted.eventId);
        }

        const ruled = this.runRules(state, actionId);
        state = ruled.state;
        produced.push(...ruled.eventIds);
        break;
      }

      case 'npc.propose': {
        const proposal = action.params.proposal;
        const evaluatedEventId = this.ids.next('evt_') as GameEventId;
        const evaluated: NpcProposalEvaluatedEvent = {
          ...this.envelope(
            state,
            evaluatedEventId,
            state.tick,
            action.actorId,
            'policy.npc' as SourceId,
            actionId,
          ),
          type: 'npc.proposal.evaluated',
          payload: {
            proposalId: proposal.proposalId,
            npcId: proposal.npcId,
            status: 'accepted',
            reasonCode: 'no_effect',
          },
        };
        state = this.apply(state, evaluated);
        produced.push(evaluatedEventId);
        break;
      }

      default: {
        const exhaustive: never = action;
        throw new Error(`unhandled action ${String(exhaustive)}`);
      }
    }

    this.commit(state);
    return this.acceptedResult(action, actionId, source, produced, state);
  }

  async save(): Promise<SaveEnvelope> {
    const withoutChecksum = {
      schemaVersion: CONTRACT_VERSION,
      saveFormatVersion: SAVE_FORMAT_VERSION,
      saveId: this.ids.next('sav_') as SaveEnvelope['saveId'],
      gameVersion: this.state.gameVersion,
      sessionId: this.sessionId,
      savedAt: this.deps.clock.nowIso(),
      engineStateHash: this.snapshot.hash,
      contractVersions: { ...CONTRACT_VERSIONS },
      payload: this.state,
    } satisfies Omit<SaveEnvelope, 'checksum'>;

    const envelope = saveEnvelopeSchema.parse({
      ...withoutChecksum,
      checksum: saveChecksum(withoutChecksum),
    });
    await this.deps.persistence.save(envelope);
    this.deps.logger.info('session saved', {
      sessionId: this.sessionId,
      stateVersion: this.state.stateVersion,
      saveId: envelope.saveId,
    });
    return envelope;
  }

  private emitInitialEvents(initialFacts: GameContent['initialFacts']): void {
    const eventId = this.ids.next('evt_') as GameEventId;
    const started: SessionStartedEvent = {
      ...this.envelope(this.state, eventId, 0, SYSTEM_ACTOR, 'engine.bootstrap' as SourceId, null),
      type: 'session.started',
      payload: {
        contentId: this.content.contentId,
        gameVersion: this.content.gameVersion,
        seed: this.state.seed,
      },
    };
    this.commit(this.apply(this.state, started));

    for (const initial of initialFacts) {
      const factEventId = this.ids.next('evt_') as GameEventId;
      const fact: Fact = {
        schemaVersion: CONTRACT_VERSION,
        factId: this.ids.next('fct_') as Fact['factId'],
        key: initial.key,
        value: initial.value,
        kind: initial.kind,
        confidence: 1,
        sourceEventId: factEventId,
        branchId: this.state.branchId,
        acquiredAtTick: 0,
        source: { kind: 'system', ref: initial.sourceRef },
      };
      const event: FactAssertedEvent = {
        ...this.envelope(this.state, factEventId, 0, SYSTEM_ACTOR, 'engine.bootstrap' as SourceId, null),
        type: 'fact.asserted',
        payload: { fact },
      };
      this.commit(this.apply(this.state, event));
    }
  }

  private envelope(
    state: GameState,
    eventId: GameEventId,
    tick: number,
    actorId: ActorId,
    sourceId: SourceId,
    actionId: ActionId | null,
  ): EventEnvelope {
    const stateVersion = state.stateVersion + 1;
    return {
      schemaVersion: CONTRACT_VERSION,
      eventId,
      sessionId: state.sessionId,
      branchId: state.branchId,
      sequenceNo: stateVersion,
      stateVersion,
      tick,
      actorId,
      sourceId,
      actionId,
      occurredAt: this.deps.clock.nowIso(),
      idempotencyKey: `${eventId}:event`,
    };
  }

  private apply(state: GameState, event: GameEvent): GameState {
    const runtime = this.runtimes.get(state.branchId);
    if (!runtime) throw new Error(`no runtime for branch ${state.branchId}`);
    return this.emitInto(runtime, event);
  }

  private emitInto(runtime: BranchRuntime, event: GameEvent): GameState {
    const validated = gameEventSchema.parse(event);
    const next = reduceGameState(runtime.state, validated);
    runtime.events.push(validated);
    runtime.state = next;
    runtime.hash = hashCanonical(next);
    runtime.history[next.stateVersion] = next;
    return next;
  }

  private requireRuntime(branchId: BranchId): BranchRuntime {
    const runtime = this.runtimes.get(branchId);
    if (!runtime) throw new Error(`no runtime for branch ${branchId}`);
    return runtime;
  }

  private view(runtime: BranchRuntime): BranchRuntimeView {
    return {
      branch: runtime.branch,
      state: runtime.state,
      hash: runtime.hash,
      history: runtime.history,
      events: runtime.events,
    };
  }

  /** Union of every branch record known to the session, for ancestry walks. */
  private branchUniverse(): Branch[] {
    const byId = new Map<BranchId, Branch>();
    for (const runtime of this.runtimes.values()) {
      for (const branch of runtime.state.branches) byId.set(branch.branchId, branch);
    }
    for (const branch of this.state.branches) byId.set(branch.branchId, branch);
    return [...byId.values()];
  }

  private chainFor(branch: Branch): Branch[] {
    return ancestryChain(this.branchUniverse(), branch.branchId);
  }

  private logs(): Map<BranchId, readonly GameEvent[]> {
    const map = new Map<BranchId, readonly GameEvent[]>();
    for (const [branchId, runtime] of this.runtimes) map.set(branchId, runtime.events);
    return map;
  }

  private activeEvents(): readonly GameEvent[] {
    const runtime = this.requireRuntime(this.state.branchId);
    return lineageEvents(runtime.branch, this.chainFor(runtime.branch), this.logs());
  }

  /**
   * Materialise the child timeline at its anchor checkpoint, then carry the
   * explicit scar allowlist across. The parent state is never touched here: the
   * only parent write is the `branch.forked` ancestry event itself.
   */
  private createChildRuntime(
    parent: BranchRuntime,
    branch: Branch,
    checkpointVersion: number,
    parentStateAfterFork: GameState,
    actionId: ActionId,
  ): void {
    const childId = branch.branchId;
    const history = parent.history
      .slice(0, checkpointVersion + 1)
      .map((state) => rebaseState(state, branch, childId));
    const inherited = history[checkpointVersion];
    if (!inherited) throw new Error('fork checkpoint state is missing from the parent history');

    const runtime: BranchRuntime = {
      branch,
      state: inherited,
      hash: hashCanonical(inherited),
      history,
      events: [],
    };
    this.runtimes.set(childId, runtime);

    const postCheckpoint = new Set<GameEventId>(
      parent.events
        .filter((event) => event.stateVersion > checkpointVersion)
        .map((event) => event.eventId),
    );
    const scars = collectScars(parentStateAfterFork, postCheckpoint);

    for (const scar of scars) {
      const eventId = this.ids.next('evt_') as GameEventId;
      const fact: Fact = {
        schemaVersion: CONTRACT_VERSION,
        factId: this.ids.next('fct_') as Fact['factId'],
        key: scar.key,
        value: scar.value,
        kind: scar.kind,
        confidence: scar.confidence,
        sourceEventId: eventId,
        branchId: childId,
        acquiredAtTick: runtime.state.tick,
        source: { kind: 'system', ref: `scar.carry:${scar.key}` },
      };
      const event: FactAssertedEvent = {
        ...this.envelope(
          runtime.state,
          eventId,
          runtime.state.tick,
          SYSTEM_ACTOR,
          'engine.branch' as SourceId,
          actionId,
        ),
        type: 'fact.asserted',
        payload: { fact },
      };
      this.emitInto(runtime, event);
    }
  }

  private assertFact(
    state: GameState,
    actionId: ActionId,
    actorId: ActorId,
    sourceId: SourceId,
    spec: {
      key: Fact['key'];
      value: JsonValue;
      kind: Fact['kind'];
      sourceRef: string;
      sourceKind: Fact['source']['kind'];
      confidence: number;
    },
  ): { state: GameState; eventId: GameEventId } {
    const eventId = this.ids.next('evt_') as GameEventId;
    const fact: Fact = {
      schemaVersion: CONTRACT_VERSION,
      factId: this.ids.next('fct_') as Fact['factId'],
      key: spec.key,
      value: spec.value,
      kind: spec.kind,
      confidence: spec.confidence,
      sourceEventId: eventId,
      branchId: state.branchId,
      acquiredAtTick: state.tick,
      source: { kind: spec.sourceKind, ref: spec.sourceRef },
    };
    const event: FactAssertedEvent = {
      ...this.envelope(state, eventId, state.tick, actorId, sourceId, actionId),
      type: 'fact.asserted',
      payload: { fact },
    };
    return { state: this.apply(state, event), eventId };
  }

  private runRules(state: GameState, actionId: ActionId): { state: GameState; eventIds: GameEventId[] } {
    const evaluations = evaluateRules(this.content.rules, state.facts);
    const eventIds: GameEventId[] = [];
    let current = state;

    for (const evaluation of evaluations) {
      const ruleEventId = this.ids.next('evt_') as GameEventId;
      const ruleEvent: RuleEvaluatedEvent = {
        ...this.envelope(current, ruleEventId, current.tick, SYSTEM_ACTOR, 'engine.rules' as SourceId, actionId),
        type: 'rule.evaluated',
        payload: {
          ruleId: evaluation.rule.ruleId,
          matched: true,
          assertedFactKeys: evaluation.assertedFacts.map((asserted) => factKeySchema.parse(asserted.key)),
        },
      };
      current = this.apply(current, ruleEvent);
      eventIds.push(ruleEventId);

      for (const asserted of evaluation.assertedFacts) {
        const factEventId = this.ids.next('evt_') as GameEventId;
        const fact: Fact = {
          schemaVersion: CONTRACT_VERSION,
          factId: this.ids.next('fct_') as Fact['factId'],
          key: factKeySchema.parse(asserted.key),
          value: asserted.value,
          kind: 'derived',
          confidence: asserted.confidence,
          sourceEventId: factEventId,
          branchId: current.branchId,
          acquiredAtTick: current.tick,
          source: { kind: 'derived', ref: asserted.sourceRef },
        };
        const factEvent: FactAssertedEvent = {
          ...this.envelope(current, factEventId, current.tick, SYSTEM_ACTOR, 'engine.rules' as SourceId, actionId),
          type: 'fact.asserted',
          payload: { fact },
        };
        current = this.apply(current, factEvent);
        eventIds.push(factEventId);
      }

      if (evaluation.endingId !== null && current.endingId === null) {
        const endingEventId = this.ids.next('evt_') as GameEventId;
        const endingEvent: EndingReachedEvent = {
          ...this.envelope(current, endingEventId, current.tick, SYSTEM_ACTOR, 'engine.rules' as SourceId, actionId),
          type: 'ending.reached',
          payload: {
            endingId: evaluation.endingId,
            summary: `Ending reached by rule ${evaluation.rule.ruleId}.`,
            factKeys: evaluation.assertedFacts.map((asserted) => factKeySchema.parse(asserted.key)),
          },
        };
        current = this.apply(current, endingEvent);
        eventIds.push(endingEventId);
      }
    }

    return { state: current, eventIds };
  }

  private reject(
    raw: unknown,
    actionId: ActionId,
    code: RejectionCode,
    message: string,
    details: Record<string, unknown>,
  ): ActionResult {
    const actor = actorIdSchema.safeParse(rawField(raw, 'actorId'));
    const actorId = actor.success ? actor.data : SYSTEM_ACTOR;
    const parsedType = actionTypeSchema.safeParse(rawField(raw, 'actionType'));
    const actionType: ActionType = parsedType.success ? parsedType.data : 'session.noop';

    const context = actionType === 'morrow.intervene' ? morrowRejectionContext(raw) : null;
    const npcContext = actionType === 'npc.propose' ? npcRejectionContext(raw) : null;
    const eventId = this.ids.next('evt_') as GameEventId;
    const event: ActionRejectedEvent = {
      ...this.envelope(this.state, eventId, this.state.tick, actorId, 'engine.validation' as SourceId, actionId),
      type: 'action.rejected',
      payload: {
        actionType,
        code,
        message,
        proposalId: context?.proposalId ?? npcContext?.proposalId ?? null,
      },
    };
    let state = this.apply(this.state, event);
    const eventIds: GameEventId[] = [eventId];

    // A rejected MORROW proposal is still a recorded proposal: ECHO must be able
    // to explain that the engine refused it and why.
    if (context) {
      const proposalEventId = this.ids.next('evt_') as GameEventId;
      const proposalEvent: MorrowProposalEvaluatedEvent = {
        ...this.envelope(
          state,
          proposalEventId,
          state.tick,
          MORROW_ACTOR,
          'engine.validation' as SourceId,
          actionId,
        ),
        type: 'morrow.proposal.evaluated',
        payload: {
          proposalId: context.proposalId,
          policyId: context.policyId,
          policyVersion: context.policyVersion,
          observationId: context.observationId,
          response: context.response,
          status: 'rejected',
          reasonCodes: [...context.reasonCodes],
          reason: message,
        },
      };
      state = this.apply(state, proposalEvent);
      eventIds.push(proposalEventId);
    }

    if (npcContext) {
      const proposalEventId = this.ids.next('evt_') as GameEventId;
      const proposalEvent: NpcProposalEvaluatedEvent = {
        ...this.envelope(
          state,
          proposalEventId,
          state.tick,
          npcContext.npcId as unknown as ActorId,
          'engine.validation' as SourceId,
          actionId,
        ),
        type: 'npc.proposal.evaluated',
        payload: {
          proposalId: npcContext.proposalId,
          npcId: npcContext.npcId,
          status: 'rejected',
          reasonCode: code,
        },
      };
      state = this.apply(state, proposalEvent);
      eventIds.push(proposalEventId);
    }

    this.commit(state);
    this.deps.logger.warn('action rejected', { sessionId: this.sessionId, code, message });

    return actionResultSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      actionId,
      sessionId: this.sessionId,
      branchId: state.branchId,
      actorId,
      sourceId: 'engine.validation',
      actionType,
      proposalId: context?.proposalId ?? npcContext?.proposalId ?? null,
      status: 'rejected',
      tick: state.tick,
      stateVersion: state.stateVersion,
      eventIds,
      rejection: { code, message, details: details as JsonObject },
      resultingStateHash: hashCanonical(state),
      createdAt: this.deps.clock.nowIso(),
    });
  }

  private acceptedResult(
    action: ParsedAction,
    actionId: ActionId,
    sourceId: SourceId,
    eventIds: GameEventId[],
    state: GameState,
  ): ActionResult {
    return actionResultSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      actionId,
      sessionId: this.sessionId,
      branchId: state.branchId,
      actorId: action.actorId,
      sourceId,
      actionType: action.actionType,
      proposalId:
        action.actionType === 'npc.propose'
          ? action.params.proposal.proposalId
          : null,
      status: 'accepted',
      tick: state.tick,
      stateVersion: state.stateVersion,
      eventIds,
      rejection: null,
      resultingStateHash: hashCanonical(state),
      createdAt: this.deps.clock.nowIso(),
    });
  }

  private commit(state: GameState): void {
    const runtime = this.requireRuntime(state.branchId);
    runtime.state = state;
    runtime.hash = hashCanonical(state);
    runtime.history[state.stateVersion] = state;
    this.state = state;
    this.snapshot = {
      state,
      hash: runtime.hash,
      revision: this.snapshot.revision + 1,
    };
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch (error) {
        this.deps.logger.error('session listener failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
