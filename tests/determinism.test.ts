import { describe, expect, it } from 'vitest';
import { canonicalJson, hashCanonical } from '../src/engine/index.js';
import { createHarness, type SessionHarness } from './helpers.js';

async function runScenario(harness: SessionHarness): Promise<void> {
  const { session } = harness;
  session.advanceTick(1);
  session.dispatch({
    actionType: 'fact.assert',
    actorId: 'player_local',
    params: { key: 'debug.counter', value: 2 },
  });
  session.advanceTick(1);
  session.recordAnchor('Checkpoint A');
  const anchor = session.getState().anchors[0];
  if (!anchor) throw new Error('anchor missing');
  session.forkBranch(anchor.anchorId, 'Timeline B');
  session.advanceTick(1);
  await session.save();
}

describe('determinism', () => {
  it('produces identical state, hashes and event logs for identical inputs', async () => {
    const first = await createHarness({ sessionId: 'ses_determinisma', seed: 'seed-a' });
    const second = await createHarness({ sessionId: 'ses_determinisma', seed: 'seed-a' });

    await runScenario(first);
    await runScenario(second);

    expect(canonicalJson(first.session.getState())).toBe(canonicalJson(second.session.getState()));
    expect(first.session.getSnapshot().hash).toBe(second.session.getSnapshot().hash);
    expect(canonicalJson(first.session.getRecentEvents(50))).toBe(
      canonicalJson(second.session.getRecentEvents(50)),
    );
  });

  it('produces a stable hash for the same state object', async () => {
    const { session } = await createHarness();
    session.advanceTick(3);
    const hash = session.getSnapshot().hash;
    expect(hashCanonical(session.getState())).toBe(hash);
    expect(session.getSnapshot().hash).toBe(hash);
  });

  it('does not depend on object key insertion order', () => {
    const left = { b: 1, a: { d: 2, c: [3, 4] } };
    const right = { a: { c: [3, 4], d: 2 }, b: 1 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashCanonical(left)).toBe(hashCanonical(right));
  });

  it('changes the hash when meaningful state changes', async () => {
    const { session } = await createHarness();
    const before = session.getSnapshot().hash;
    session.advanceTick(1);
    expect(session.getSnapshot().hash).not.toBe(before);
  });

  it('keeps the rule outcome deterministic across ticks', async () => {
    const first = await createHarness({ sessionId: 'ses_rulesa', seed: 'seed-rules' });
    const second = await createHarness({ sessionId: 'ses_rulesa', seed: 'seed-rules' });

    for (const harness of [first, second]) {
      harness.session.dispatch({
        actionType: 'fact.assert',
        actorId: 'player_local',
        params: { key: 'debug.counter', value: 2 },
      });
      harness.session.advanceTick(1);
    }

    expect(first.session.getState().facts['debug.flag']?.value).toBe(true);
    expect(canonicalJson(first.session.getState())).toBe(canonicalJson(second.session.getState()));
  });
});
