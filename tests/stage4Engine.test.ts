import { describe, expect, it } from 'vitest';
import {
  StaticContentPort,
  canonicalJson,
  hashCanonical,
  type ActionResult,
} from '../src/engine/index.js';
import { STAGE4_CONTENT } from '../src/content/stage4Content.js';
import { createHarness } from './helpers.js';

function stage4Harness(seed = 'stage4-test-seed', sessionId?: string) {
  return createHarness({
    content: new StaticContentPort(STAGE4_CONTENT),
    seed,
    ...(sessionId ? { sessionId } : {}),
  });
}

function expectAccepted(result: ActionResult): void {
  expect(result.status).toBe('accepted');
  expect(result.rejection).toBeNull();
}

async function collectEvidence(
  session: Awaited<ReturnType<typeof stage4Harness>>['session'],
): Promise<ActionResult> {
  return session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId: 'relay_7_log' },
  });
}

async function decide(
  session: Awaited<ReturnType<typeof stage4Harness>>['session'],
  optionId: string,
): Promise<ActionResult> {
  return session.dispatch({
    actionType: 'choice.make',
    actorId: 'player_local',
    params: { nodeId: 'node.sable.relay', optionId },
  });
}

describe('Stage 4 evidence collection', () => {
  it('collects a content-defined evidence fact once', async () => {
    const { session } = await stage4Harness();
    const result = await collectEvidence(session);
    expectAccepted(result);

    const state = session.getState();
    const fact = state.facts['evidence.relay_7'];
    expect(fact).toBeDefined();
    expect(fact?.kind).toBe('observed');
    expect(fact?.source).toEqual({ kind: 'record', ref: 'record.relay_7.terminal' });
    expect(state.player.progress.evidenceFound).toBe(1);

    // Rule consequence: the recovered log unlocks the relay hand-off.
    expect(state.facts['story.relay_ready']?.value).toBe(true);
    expect(state.facts['story.relay_ready']?.kind).toBe('derived');

    expect(result.eventIds.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects duplicate collection without changing canonical facts', async () => {
    const { session } = await stage4Harness();
    expectAccepted(await collectEvidence(session));
    const before = canonicalJson(session.getState().facts);
    const version = session.getState().stateVersion;

    const second = await collectEvidence(session);
    expect(second.status).toBe('rejected');
    expect(second.rejection?.code).toBe('duplicate');
    expect(canonicalJson(session.getState().facts)).toBe(before);
    expect(session.getState().player.progress.evidenceFound).toBe(1);
    // Only the rejection event is appended.
    expect(session.getState().stateVersion).toBe(version + 1);
  });

  it('rejects an evidence id that content does not define', async () => {
    const { session } = await stage4Harness();
    const result = await session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'invented_log' },
    });
    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('unknown_target');
    expect(Object.keys(session.getState().facts)).not.toContain('evidence.invented_log');
  });

  it('does not let evidence parameters carry a fact key or value', async () => {
    const { session } = await stage4Harness();
    const result = await session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log', key: 'evidence.invented' },
    });
    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('invalid_action');
  });
});

describe('Stage 4 choice and consequence', () => {
  it('records the share choice and derives a visible canonical consequence', async () => {
    const { session } = await stage4Harness();
    expectAccepted(await collectEvidence(session));
    const result = await decide(session, 'share');
    expectAccepted(result);

    const state = session.getState();
    expect(state.choices).toHaveLength(1);
    expect(state.choices[0]?.nodeId).toBe('node.sable.relay');
    expect(state.choices[0]?.optionId).toBe('share');
    expect(state.choices[0]?.consequenceKeys).toEqual([
      'world.ward_alert',
      'npc.sable.stance',
    ]);
    expect(state.facts['story.relay_choice']?.value).toBe('share');
    expect(state.facts['world.ward_alert']?.value).toBe('raised');
    expect(state.facts['npc.sable.stance']?.value).toBe('relieved');
    expect(state.player.progress.choicesMade).toBe(1);
  });

  it('records the conceal choice as the opposite consequence', async () => {
    const { session } = await stage4Harness();
    expectAccepted(await decide(session, 'conceal'));

    const state = session.getState();
    expect(state.facts['world.ward_alert']?.value).toBe('suppressed');
    expect(state.facts['npc.sable.stance']?.value).toBe('guarded');
  });

  it('is idempotent: a second decision on the same node is rejected', async () => {
    const { session } = await stage4Harness();
    expectAccepted(await decide(session, 'share'));
    const before = canonicalJson(session.getState());

    const second = await decide(session, 'conceal');
    expect(second.status).toBe('rejected');
    expect(second.rejection?.code).toBe('duplicate');
    expect(session.getState().choices).toHaveLength(1);
    expect(session.getState().facts['world.ward_alert']?.value).toBe('raised');
    expect(session.getState().facts['npc.sable.stance']?.value).toBe('relieved');

    // Only the rejection event and its version increment differ.
    const after = session.getState();
    expect(after.stateVersion).toBe(JSON.parse(before).stateVersion + 1);
  });

  it('rejects an unknown option', async () => {
    const { session } = await stage4Harness();
    const result = await decide(session, 'sell_the_log');
    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('unknown_target');
    expect(session.getState().choices).toHaveLength(0);
  });

  it('does not re-fire the consequence rule on later actions', async () => {
    const { session } = await stage4Harness();
    expectAccepted(await decide(session, 'share'));
    const firstAlert = session.getState().facts['world.ward_alert'];

    session.advanceTick(1);
    const second = session.getState().facts['world.ward_alert'];
    expect(second?.factId).toBe(firstAlert?.factId);
    expect(second?.acquiredAtTick).toBe(firstAlert?.acquiredAtTick);
  });
});

describe('Stage 4 anchor and state consistency', () => {
  it('records a valid anchor that checkpoints the current state hash', async () => {
    const { session } = await stage4Harness();
    expectAccepted(await collectEvidence(session));
    expectAccepted(await decide(session, 'share'));

    const before = hashCanonical(session.getState());
    const result = session.recordAnchor('Lamp post — Relay 7');
    expectAccepted(result);

    const state = session.getState();
    expect(state.anchors).toHaveLength(1);
    expect(state.anchors[0]?.label).toBe('Lamp post — Relay 7');
    expect(state.anchors[0]?.stateHash).toBe(before);
    expect(state.player.progress.anchorsReached).toBe(1);
  });

  it('replays deterministically from the same seed and inputs', async () => {
    const first = await stage4Harness('stage4-determinism', 'ses_stage4det');
    const second = await stage4Harness('stage4-determinism', 'ses_stage4det');

    for (const harness of [first, second]) {
      expectAccepted(await collectEvidence(harness.session));
      expectAccepted(await decide(harness.session, 'conceal'));
      harness.session.recordAnchor('Lamp post — Relay 7');
    }

    expect(canonicalJson(first.session.getState())).toBe(
      canonicalJson(second.session.getState()),
    );
  });
});
