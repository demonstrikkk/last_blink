import { describe, expect, it } from 'vitest';
import {
  DeterministicGameSession,
  FixedClock,
  canonicalJson,
  createPrefixPolicy,
  saveEnvelopeSchema,
  type GameEvent,
  type GameSession,
} from '../src/engine/index.js';
import { createHarness } from './helpers.js';

describe('GameSession with mock ports', () => {
  it('starts from content without a browser, database or model', async () => {
    const { session } = await createHarness();
    const state = session.getState();

    expect(state.sessionId).toBe(session.sessionId);
    expect(state.tick).toBe(0);
    expect(state.stateVersion).toBe(3);
    expect(state.facts['debug.counter']?.value).toBe(0);
    expect(state.branches).toHaveLength(1);
    expect(state.player.playerId).toBe('ply_testplayer');
    expect(session.getSnapshot().hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('exposes the agreed interface', async () => {
    const harness = await createHarness();
    const session: GameSession = harness.session;

    expect(typeof session.getState).toBe('function');
    expect(typeof session.dispatch).toBe('function');
    expect(typeof session.subscribe).toBe('function');
    expect(typeof session.save).toBe('function');

    const result = session.advanceTick(2);
    expect(result.status).toBe('accepted');
    expect(session.getState().tick).toBe(2);
  });

  it('advances ticks and fires rules deterministically', async () => {
    const { session } = await createHarness();

    session.advanceTick(1);
    const derived = session.dispatch({
      actionType: 'fact.assert',
      actorId: 'player_local',
      params: { key: 'debug.counter', value: 2, sourceRef: 'test.counter' },
    });

    expect(derived.status).toBe('accepted');
    expect(session.getState().facts['debug.flag']?.value).toBe(true);
    expect(session.getState().facts['debug.flag']?.kind).toBe('derived');

    const types = session.getRecentEvents(50).map((event) => event.type);
    expect(types).toContain('rule.evaluated');
    expect(types).toContain('fact.asserted');
  });

  it('records anchors that hash the pre-anchor state', async () => {
    const { session } = await createHarness();
    session.advanceTick(1);
    const preHash = session.getSnapshot().hash;

    const result = session.recordAnchor('Relay approach');
    expect(result.status).toBe('accepted');

    const anchor = session.getState().anchors[0];
    expect(anchor).toBeDefined();
    expect(anchor?.stateHash).toBe(preHash);
    expect(anchor?.stateVersion).toBe(4);
    expect(session.getState().player.progress.anchorsReached).toBe(1);

    const duplicate = session.recordAnchor('Second at same version');
    expect(duplicate.status).toBe('rejected');
    expect(duplicate.rejection?.code).toBe('duplicate');
  });

  it('forks a branch from a recorded anchor', async () => {
    const { session } = await createHarness();
    session.advanceTick(1);
    session.recordAnchor('Fork point');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');

    const result = session.forkBranch(anchor.anchorId, 'Second timeline');
    expect(result.status).toBe('accepted');

    const state = session.getState();
    expect(state.branches).toHaveLength(2);
    const root = state.branches[0];
    expect(state.branchId).toBe(root?.branchId);
    const child = state.branches[1];
    expect(child?.parentBranchId).toBe(state.branchId);
    expect(child?.forkedAtAnchorId).toBe(anchor.anchorId);
    expect(child?.timelineIndex).toBe(1);

    const again = session.forkBranch(anchor.anchorId, 'Again');
    expect(again.status).toBe('rejected');
    expect(again.rejection?.code).toBe('duplicate');
  });

  it('notifies subscribers with the new snapshot', async () => {
    const { session } = await createHarness();
    const seen: string[] = [];
    const unsubscribe = session.subscribe((snapshot) => seen.push(snapshot.hash));

    session.advanceTick(1);
    const afterFirst = session.getSnapshot().hash;
    unsubscribe();
    session.advanceTick(1);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(afterFirst);
    expect(session.getSnapshot().hash).not.toBe(afterFirst);
  });

  it('saves and restores with mock persistence', async () => {
    const harness = await createHarness();
    const { session } = harness;
    session.advanceTick(2);
    session.dispatch({
      actionType: 'fact.assert',
      actorId: 'player_local',
      params: { key: 'debug.counter', value: 2 },
    });
    session.recordAnchor('Saved checkpoint');

    const envelope = await session.save();
    expect(saveEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(Object.keys(envelope.contractVersions)).toHaveLength(15);
    expect((await harness.persistence.list())).toHaveLength(1);
    expect(await harness.persistence.load(session.sessionId)).not.toBeNull();

    const restored = await DeterministicGameSession.restore(envelope, {
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
      policy: harness.policy,
      persistence: harness.persistence,
      content: harness.content,
      logger: harness.logger,
    });

    expect(canonicalJson(restored.getState())).toBe(canonicalJson(session.getState()));
    expect(restored.getSnapshot().hash).toBe(session.getSnapshot().hash);
    expect(restored.getRecentEvents()).toHaveLength(0);

    restored.advanceTick(1);
    expect(restored.getState().stateVersion).toBe(session.getState().stateVersion + 1);
  });
});

describe('invalid actions', () => {
  it('rejects malformed actions without changing world facts', async () => {
    const { session } = await createHarness();
    const before = canonicalJson(session.getState().facts);

    const cases: unknown[] = [
      { actionType: 'story.teleport', actorId: 'player_local', params: {} },
      { actionType: 'session.advance_tick', actorId: 'player_local', params: { ticks: 0 } },
      { actionType: 'session.advance_tick', actorId: 'player_local', params: { ticks: 99 } },
      {
        actionType: 'fact.assert',
        actorId: 'player_local',
        params: { key: 'evidence.forged', value: true },
      },
      {
        actionType: 'branch.fork',
        actorId: 'player_local',
        params: { anchorId: 'anc_missing', label: 'Nowhere' },
      },
      null,
      'not-an-action',
    ];

    for (const candidate of cases) {
      const result = session.dispatch(candidate);
      expect(result.status).toBe('rejected');
      expect(result.rejection).not.toBeNull();
      expect(result.eventIds).toHaveLength(1);
    }

    expect(canonicalJson(session.getState().facts)).toBe(before);
    expect(session.getState().tick).toBe(0);
    const last: GameEvent | undefined = session.getRecentEvents(1)[0];
    expect(last?.type).toBe('action.rejected');
  });

  it('rejects actions denied by policy without applying them', async () => {
    const harness = await createHarness({ policy: createPrefixPolicy(['debug.counter']) });
    const result = harness.session.dispatch({
      actionType: 'fact.assert',
      actorId: 'player_local',
      params: { key: 'debug.counter', value: 5 },
    });

    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('policy_denied');
    expect(harness.session.getState().facts['debug.counter']?.value).toBe(0);
    expect(harness.session.getState().tick).toBe(0);
  });

  it('records rejections as auditable events', async () => {
    const { session } = await createHarness();
    const versionBefore = session.getState().stateVersion;
    const result = session.dispatch({
      actionType: 'session.advance_tick',
      actorId: 'player_local',
      params: { ticks: -1 },
    });

    expect(result.status).toBe('rejected');
    expect(session.getState().stateVersion).toBe(versionBefore + 1);
    expect(result.stateVersion).toBe(versionBefore + 1);
    expect(session.getRecentEvents(1)[0]?.type).toBe('action.rejected');
    expect(session.getState().lastEventId).toBe(result.eventIds[0]);
  });
});
