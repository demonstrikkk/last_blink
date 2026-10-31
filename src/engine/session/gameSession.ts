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
  type PlayerProfile,
  type RuleEvaluatedEvent,
  type SaveEnvelope,
  type SessionId,
  type SessionStartedEvent,
  type SourceId,
  type TickAdvancedEvent,
} from '../contracts/index.js';
import type { ParsedAction } from '../core/actions.js';
import { hashCanonical } from '../core/hash.js';
import { createDeterministicIdFactory, type IdFactory } from '../core/ids.js';
import { reduceGameState } from '../core/reducer.js';
import { evaluateRules } from '../core/rules.js';
import { validateAction, type RejectionCode } from '../core/validation.js';
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
  dispatch(action: unknown): ActionResult;
  advanceTick(ticks?: number): ActionResult;
  recordAnchor(label: string): ActionResult;
  forkBranch(anchorId: string, label?: string): ActionResult;
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
  save(): Promise<SaveEnvelope>;
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
const MAX_RECENT_EVENTS = 50;

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
  private readonly events: GameEvent[] = [];
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
    this.events.push(...initialEvents);
    this.snapshot = { state, hash: hashCanonical(state), revision: 0 };
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
    return this.events.slice(Math.max(0, this.events.length - size));
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
        const eventId = this.ids.next('evt_') as GameEventId;
        const branch: Branch = {
          schemaVersion: CONTRACT_VERSION,
          branchId: this.ids.next('brn_') as BranchId,
          sessionId: state.sessionId,
          parentBranchId: state.branchId,
          forkedAtAnchorId: anchor.anchorId,
          forkedAtTick: state.tick,
          forkedAtStateVersion: state.stateVersion,
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
    const validated = gameEventSchema.parse(event);
    const next = reduceGameState(state, validated);
    this.events.push(validated);
    return next;
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

    const eventId = this.ids.next('evt_') as GameEventId;
    const event: ActionRejectedEvent = {
      ...this.envelope(this.state, eventId, this.state.tick, actorId, 'engine.validation' as SourceId, actionId),
      type: 'action.rejected',
      payload: { actionType, code, message, proposalId: null },
    };
    const state = this.apply(this.state, event);
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
      proposalId: null,
      status: 'rejected',
      tick: state.tick,
      stateVersion: state.stateVersion,
      eventIds: [eventId],
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
      proposalId: null,
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
    this.state = state;
    this.snapshot = {
      state,
      hash: hashCanonical(state),
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
