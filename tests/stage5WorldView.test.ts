import { describe, expect, it } from 'vitest';
import { StaticContentPort } from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { deriveWorldView, targetAvailable } from '../src/world/worldView.js';
import { WORLD_TARGETS } from '../src/world/district.js';
import { createHarness } from './helpers.js';

function stage5Harness() {
  return createHarness({
    content: new StaticContentPort(STAGE5_CONTENT),
    seed: 'stage5-view-seed',
  });
}

function collect(
  session: Awaited<ReturnType<typeof stage5Harness>>['session'],
  evidenceId: string,
): void {
  session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId },
  });
}

function choose(
  session: Awaited<ReturnType<typeof stage5Harness>>['session'],
  nodeId: string,
  optionId: string,
): void {
  session.dispatch({
    actionType: 'choice.make',
    actorId: 'player_local',
    params: { nodeId, optionId },
  });
}

describe('Stage 5 world view projection', () => {
  it('projects the investigation objectives and gated evidence', async () => {
    const { session } = await stage5Harness();
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);

    expect(view.evidence).toHaveLength(3);
    expect(view.evidenceTotal).toBe(3);
    expect(view.objectives).toHaveLength(6);
    expect(view.currentObjective?.objectiveId).toBe('obj_read_relay');
    expect(view.phase).toBe('arrival');
    expect(view.choices).toHaveLength(3);
    expect(view.choice?.nodeId).toBe('node.sable.relay');
    expect(view.choice?.available).toBe(false);
    expect(view.choice?.missing).toEqual(['evidence.relay_7']);

    expect(targetAvailable(view, 'relay_7_log')).toBe(true);
    expect(targetAvailable(view, 'ward_dispatch')).toBe(false);
    expect(targetAvailable(view, 'sable')).toBe(true);
    expect(targetAvailable(view, 'ivo')).toBe(true);
    expect(targetAvailable(view, 'ward_call')).toBe(true);
    expect(targetAvailable(view, 'anchor_lamp')).toBe(true);
  });

  it('exposes provenance, availability and objective completion', async () => {
    const { session } = await stage5Harness();
    collect(session, 'relay_7_log');
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);

    const relay = view.evidence.find((item) => item.evidenceId === 'relay_7_log');
    expect(relay?.collected).toBe(true);
    expect(relay?.provenance).toBe('record.relay_7.terminal');
    expect(relay?.sourceKind).toBe('record');
    expect(relay?.confidence).toBe(0.9);

    expect(view.objectives[0]?.done).toBe(true);
    expect(view.objectives[1]?.done).toBe(false);
    expect(view.currentObjective?.objectiveId).toBe('obj_decide_relay');
    expect(view.phase).toBe('investigation');
    expect(view.choice?.available).toBe(true);
    expect(targetAvailable(view, 'relay_7_log')).toBe(false);
    expect(targetAvailable(view, 'ward_dispatch')).toBe(true);
  });

  it('shows a locked decision with the missing prerequisites', async () => {
    const { session } = await stage5Harness();
    collect(session, 'relay_7_log');
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);

    const vendor = view.choices.find((node) => node.nodeId === 'node.vendor.silence');
    expect(vendor?.available).toBe(false);
    expect(vendor?.missing).toEqual(['evidence.vendor_testimony']);

    const ward = view.choices.find((node) => node.nodeId === 'node.ward.call');
    expect(ward?.available).toBe(false);
    expect(ward?.missing).toEqual([
      'story.relay_choice_resolved',
      'story.vendor_choice_resolved',
    ]);
  });

  it('projects the full causal state and ending after the final call', async () => {
    const { session } = await stage5Harness();
    collect(session, 'relay_7_log');
    choose(session, 'node.sable.relay', 'share');
    collect(session, 'ward_dispatch');
    collect(session, 'vendor_testimony');
    choose(session, 'node.vendor.silence', 'protect');
    choose(session, 'node.ward.call', 'file');

    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    expect(view.phase).toBe('resolved');
    expect(view.wardAlert).toBe('raised');
    expect(view.sableTrust).toBe('trusted');
    expect(view.ivoStance).toBe('protected');
    expect(view.dispatchContinuity).toBe('unbroken');
    expect(view.vendorConfidence).toBe('high');
    expect(view.morrowScrutiny).toBe('elevated');
    expect(view.endingId).toBe('ending.open_record');
    expect(view.ending?.title).toBe('The Open Record');
    expect(view.ending?.summary).toContain('dispatch chain intact');
    expect(view.objectives.every((objective) => objective.done)).toBe(true);
    expect(view.currentObjective).toBeNull();
  });
});

describe('Stage 5 world targets', () => {
  it('places a target for every interactive story location', () => {
    const ids = WORLD_TARGETS.map((target) => target.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sable',
        'ivo',
        'ward_call',
        'relay_7_log',
        'ward_dispatch',
        'anchor_lamp',
      ]),
    );
    for (const target of WORLD_TARGETS) {
      expect(target.radius).toBeGreaterThan(0);
      expect(target.tileX).toBeGreaterThan(0);
      expect(target.tileY).toBeGreaterThan(0);
    }
  });
});
