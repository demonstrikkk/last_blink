import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  canonicalJson,
  gameEventSchema,
  hashCanonical,
  type GameEvent,
} from '../src/engine/index.js';
import { createHarness } from './helpers.js';

const NOW = '2026-01-01T00:00:00.000Z';
const BASE = {
  schemaVersion: CONTRACT_VERSION,
  sessionId: 'ses_roundtrip',
  branchId: 'brn_main',
  sequenceNo: 7,
  stateVersion: 7,
  tick: 3,
  actorId: 'system_engine',
  sourceId: 'engine.core',
  actionId: null,
  occurredAt: NOW,
  idempotencyKey: 'roundtrip-event-key',
} as const;

const EVENTS = [
  {
    ...BASE,
    eventId: 'evt_roundtrip1',
    type: 'session.started',
    payload: { contentId: 'content.stage3.scaffold', gameVersion: '0.1.0', seed: 'seed' },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip2',
    type: 'tick.advanced',
    payload: { fromTick: 2, toTick: 3, reason: 'manual' },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip3',
    type: 'fact.asserted',
    payload: {
      fact: {
        schemaVersion: CONTRACT_VERSION,
        factId: 'fct_roundtrip',
        key: 'debug.counter',
        value: 3,
        kind: 'asserted',
        confidence: 1,
        sourceEventId: 'evt_roundtrip3',
        branchId: 'brn_main',
        acquiredAtTick: 3,
        source: { kind: 'system', ref: 'test' },
        contaminated: false,
        contaminationSource: null,
      },
    },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip4',
    type: 'choice.made',
    payload: {
      choice: {
        schemaVersion: CONTRACT_VERSION,
        choiceId: 'cho_roundtrip',
        sessionId: 'ses_roundtrip',
        branchId: 'brn_main',
        nodeId: 'node.one',
        optionId: 'option.one',
        madeAtTick: 3,
        sourceEventId: 'evt_roundtrip4',
        consequenceKeys: ['debug.counter'],
      },
    },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip5',
    type: 'rule.evaluated',
    payload: { ruleId: 'rul_scaffold_threshold', matched: true, assertedFactKeys: ['debug.flag'] },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip6',
    type: 'anchor.recorded',
    payload: {
      anchor: {
        schemaVersion: CONTRACT_VERSION,
        anchorId: 'anc_roundtrip',
        sessionId: 'ses_roundtrip',
        branchId: 'brn_main',
        label: 'Checkpoint',
        tick: 3,
        stateVersion: 6,
        stateHash: '0123456789abcdef',
        eventSequenceNo: 7,
        safe: true,
        sourceEventId: 'evt_roundtrip6',
        createdAt: NOW,
      },
    },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip7',
    type: 'branch.forked',
    payload: {
      branch: {
        schemaVersion: CONTRACT_VERSION,
        branchId: 'brn_fork',
        sessionId: 'ses_roundtrip',
        parentBranchId: 'brn_main',
        forkedAtAnchorId: 'anc_roundtrip',
        forkedAtTick: 3,
        forkedAtStateVersion: 6,
        forkedAtEventSequenceNo: 7,
        forkedAtStateHash: '0123456789abcdef',
        label: 'Fork',
        status: 'active',
        timelineIndex: 1,
        createdAt: NOW,
        forkReason: 'anchor',
      },
      fromAnchorId: 'anc_roundtrip',
    },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip8',
    type: 'npc.proposal.evaluated',
    payload: {
      proposalId: 'prp_roundtrip',
      npcId: 'npc_archivist',
      status: 'accepted',
      reasonCode: 'validated',
    },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip9',
    type: 'ending.reached',
    payload: { endingId: 'ending.test', summary: 'Test ending.', factKeys: ['debug.flag'] },
  },
  {
    ...BASE,
    eventId: 'evt_roundtrip10',
    type: 'action.rejected',
    payload: {
      actionType: 'session.advance_tick',
      code: 'invalid_action',
      message: 'no',
      proposalId: null,
    },
  },
] as unknown as GameEvent[];

describe('event serialisation', () => {
  it('round-trips every event variant without changing canonical form', () => {
    for (const event of EVENTS) {
      const encoded = JSON.stringify(event);
      const decoded = gameEventSchema.parse(JSON.parse(encoded) as unknown);
      expect(canonicalJson(decoded)).toBe(canonicalJson(event));
      expect(hashCanonical(decoded)).toBe(hashCanonical(event));
    }
  });

  it('round-trips events actually produced by a session', async () => {
    const { session } = await createHarness();
    session.advanceTick(2);
    session.dispatch({
      actionType: 'fact.assert',
      actorId: 'player_local',
      params: { key: 'debug.counter', value: 2 },
    });
    session.recordAnchor('Session checkpoint');
    session.dispatch({ actionType: 'session.advance_tick', actorId: 'player_local', params: { ticks: 0 } });

    const events = session.getRecentEvents(50);
    expect(events.length).toBeGreaterThan(4);
    for (const event of events) {
      const decoded = gameEventSchema.parse(JSON.parse(JSON.stringify(event)) as unknown);
      expect(decoded).toEqual(event);
    }
  });

  it('rejects an unknown event type', () => {
    const invalid = { ...EVENTS[1]!, type: 'timeline.rewound' };
    expect(gameEventSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects extra payload fields rather than stripping them', () => {
    const invalid = {
      ...EVENTS[1]!,
      payload: { ...EVENTS[1]!.payload, smuggled: true },
    };
    expect(gameEventSchema.safeParse(invalid).success).toBe(false);
  });
});
