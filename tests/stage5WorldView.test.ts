import { describe, expect, it } from 'vitest';
import { StaticContentPort } from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { deriveWorldView, targetAvailable } from '../src/world/worldView.js';
import { getDialogueScript } from '../src/content/stage5Dialogue.js';
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
  it('lets Ivo provide a useful partial account before the dispatch slip', async () => {
    const { session } = await stage5Harness();
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const script = getDialogueScript('ivo', session.getState(), view);

    expect(script.lines.some((line) => line.text.includes('not carrying a sealed pouch'))).toBe(true);
    expect(script.lines.some((line) => line.text.includes('north board'))).toBe(true);
    expect(script.gate).toContain('optional corroboration lead');
    expect(script.grantsEvidenceId).toBeUndefined();
  });

  it('projects an information-driven roadmap instead of a mandatory character sequence', async () => {
    const { session } = await stage5Harness();
    let view = deriveWorldView(session.getState(), STAGE5_CONTENT);

    expect(view.roadmap.some((item) => item.kind === 'lead')).toBe(true);
    expect(view.roadmap.some((item) => item.label === 'Talk to Sable')).toBe(false);
    expect(view.roadmap.some((item) => item.label === "Hear Ivo's account")).toBe(false);

    collect(session, 'ward_dispatch');
    collect(session, 'vendor_testimony');
    view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    expect(view.roadmap.some((item) => item.kind === 'uncertain')).toBe(true);
    expect(view.roadmap.some((item) => item.label.includes('Authorized Dispatch'))).toBe(true);
  });

  it('deepens Ivo questioning after the slip', async () => {
    const { session } = await stage5Harness();
    collect(session, 'ward_dispatch');
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const script = getDialogueScript('ivo', session.getState(), view);

    expect(script.grantsEvidenceId).toBe('vendor_testimony');
    expect(script.lines.some((line) => line.text.includes('explicit contradiction'))).toBe(true);
  });

  it('projects the investigation objectives and gated evidence', async () => {
    const { session } = await stage5Harness();
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);

    expect(view.evidence).toHaveLength(14);
    expect(view.evidenceTotal).toBe(14);
    expect(view.objectives).toHaveLength(8);
    expect(view.objectives.filter((objective) => objective.optional)).toHaveLength(2);
    expect(view.currentObjective?.objectiveId).toBe('obj_read_relay');
    expect(view.phase).toBe('arrival');
    expect(view.choices).toHaveLength(7);
    expect(view.choice?.nodeId).toBe('node.sable.relay');
    expect(view.choice?.available).toBe(false);
    expect(view.choice?.missing).toEqual(['evidence.relay_7']);

    expect(targetAvailable(view, 'relay_7_log')).toBe(true);
    expect(targetAvailable(view, 'ward_dispatch')).toBe(true);
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

  it('derives evidence links and an inconclusive case before material harm is established', async () => {
    const { session } = await stage5Harness();
    collect(session, 'ward_dispatch');
    collect(session, 'vendor_testimony');
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const contradiction = view.caseAssessment.links.find((link) => link.relation === 'contradicts');

    expect(view.caseAssessment.verdict).toBe('inconclusive');
    expect(contradiction?.established).toBe(true);
    expect(view.caseAssessment.explanation).toContain('does not yet establish');
  });

  it('recognizes a grounded disproportionate MORROW case from collected material evidence', async () => {
    const { session } = await stage5Harness();
    for (const evidenceId of ['human_cost', 'plaza_terminal', 'depot_terminal']) collect(session, evidenceId);
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);

    expect(view.caseAssessment.verdict).toBe('unjustified');
    expect(view.caseAssessment.supportingEvidenceIds).toEqual(
      expect.arrayContaining(['plaza_terminal', 'depot_terminal']),
    );
    expect(view.caseAssessment.contradictoryEvidenceIds).toContain('human_cost');
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
    expect(
      view.objectives.filter((objective) => !objective.optional).every((objective) => objective.done),
    ).toBe(true);
    expect(view.currentObjective).toBeNull();
  });

  it('reconstructs the zeroing device and only disarms it with the root override', async () => {
    const { session } = await stage5Harness();
    for (const evidenceId of [
      'clue_conduit',
      'surveillance_frequency',
      'archive_record',
      'zeroing_order',
      'clue_locker',
      'detonator_schematic',
    ]) {
      collect(session, evidenceId);
    }

    let view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    expect(view.attackPlan.reconstructed).toBe(true);
    expect(view.attackPlan.disarmed).toBe(false);
    expect(view.attackPlan.disarmReady).toBe(false);
    expect(view.attackPlan.missing).toEqual([]);
    expect(view.ending).toBeNull();
    expect(view.choices.find((node) => node.nodeId === 'node.relay.disarm')?.available).toBe(false);

    collect(session, 'depot_terminal');
    view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    expect(view.attackPlan.disarmReady).toBe(true);
    expect(view.choices.find((node) => node.nodeId === 'node.relay.disarm')?.available).toBe(true);

    choose(session, 'node.relay.disarm', 'cut');
    view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    expect(view.attackPlan.disarmed).toBe(true);
    expect(view.endingId).toBe('ending.disarmed_dawn');
    expect(view.catastrophe.status).toBe('averted');
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

  it('anchors every puzzle at its own reachable map tile', async () => {
    const { session } = await stage5Harness();
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const puzzles = WORLD_TARGETS.filter((target) => target.kind === 'puzzle');

    expect(puzzles.map((target) => target.puzzle)).toEqual(
      expect.arrayContaining(['signal', 'timeline', 'contradiction', 'bomb']),
    );
    expect(puzzles).toHaveLength(4);
    for (const target of puzzles) {
      expect(target.puzzle).toBeDefined();
      expect(target.radius).toBeGreaterThanOrEqual(28);
      expect(targetAvailable(view, target.id)).toBe(true);
    }

    const puzzleTiles = puzzles.map((target) => `${target.tileX},${target.tileY}`);
    expect(new Set(puzzleTiles).size).toBe(puzzleTiles.length);
    for (const target of WORLD_TARGETS) {
      if (target.kind === 'puzzle') continue;
      expect(puzzleTiles).not.toContain(`${target.tileX},${target.tileY}`);
    }
  });
});
