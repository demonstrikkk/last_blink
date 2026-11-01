import { describe, expect, it } from 'vitest';
import {
  CITY_ROSTER,
  EchoService,
  StaticContentPort,
  buildMorrowPlan,
  clockLabel,
  priorLoopsFromBranches,
  tacticWeights,
  type ActionResult,
  type GameState,
  type MorrowPlan,
} from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createHarness, type SessionHarness } from './helpers.js';

/**
 * The 08:00 -> 18:00 loop, the catastrophe, the cross-loop ECHO ledger and
 * MORROW's bounded, reproducible plan. Everything here is engine-level: no
 * browser, no provider, no model.
 */

const STREET = new StaticContentPort(STAGE5_CONTENT);

async function streetHarness(seed = 'time-loop-seed'): Promise<SessionHarness> {
  return createHarness({ content: STREET, seed });
}

function dispatchNoop(harness: SessionHarness): ActionResult {
  return harness.session.dispatch({
    actionType: 'session.noop',
    actorId: 'player_local',
    params: {},
  });
}

function burnToDeadline(harness: SessionHarness): void {
  for (let index = 0; index < 60; index += 1) {
    harness.session.advanceTick(10);
  }
}

function planFor(
  state: GameState,
  targetIds: readonly string[],
  tactic: MorrowPlan['tactic'] = 'discredit_witness',
): MorrowPlan {
  return {
    schemaVersion: '1.0.0',
    planId: `plan_test_${targetIds.length}`,
    sessionId: String(state.sessionId) as MorrowPlan['sessionId'],
    branchId: String(state.branchId) as MorrowPlan['branchId'],
    loopIndex: state.loop.index,
    tactic,
    targets: targetIds.map((npcId) => ({
      npcId: npcId as MorrowPlan['targets'][number]['npcId'],
      interference: 'altered_recollection',
      durationMinutes: 120,
      focusEvidenceId: 'vendor_testimony',
    })),
    rationale: 'test plan',
    predictedFocus: ['vendor_testimony'],
    createdAtTick: state.tick,
    provider: 'deterministic',
  };
}

function submitPlan(harness: SessionHarness, plan: MorrowPlan): ActionResult {
  return harness.session.dispatch({
    actionType: 'morrow.plan',
    actorId: 'system_morrow',
    params: { plan },
  });
}

function collect(harness: SessionHarness, evidenceId: string): ActionResult {
  return harness.session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId },
  });
}

describe('the 08:00 to 18:00 clock', () => {
  it('starts every branch at 08:00 with the deadline still ahead', async () => {
    const harness = await streetHarness();
    const state = harness.session.getState();

    expect(state.tick).toBe(0);
    expect(clockLabel(state.tick)).toBe('08:00');
    expect(state.loop.index).toBe(1);
    expect(state.catastrophe.status).toBe('pending');
    expect(state.loop.checkpointFacts.length).toBeGreaterThan(0);
    expect(
      harness.session.getLineageEvents().some((event) => event.type === 'loop.started'),
    ).toBe(true);
  });

  it('charges time for investigation and nothing for harmless navigation', async () => {
    const harness = await streetHarness();

    expect(dispatchNoop(harness).status).toBe('accepted');
    expect(harness.session.getState().tick).toBe(0);

    expect(collect(harness, 'ward_dispatch').status).toBe('accepted');
    expect(harness.session.getState().tick).toBe(60);
    expect(clockLabel(harness.session.getState().tick)).toBe('09:00');
  });

  it('fires the catastrophe at 18:00 and refuses to keep playing that timeline', async () => {
    const harness = await streetHarness();
    burnToDeadline(harness);

    const state = harness.session.getState();
    expect(state.tick).toBe(600);
    expect(clockLabel(state.tick)).toBe('18:00');
    expect(state.catastrophe.status).toBe('occurred');
    expect(state.catastrophe.occurredAtTick).toBe(600);
    expect(state.catastrophe.sequence.length).toBeGreaterThan(0);

    const blocked = collect(harness, 'ward_dispatch');
    expect(blocked.status).toBe('rejected');
    if (blocked.status === 'rejected') {
      expect(blocked.rejection?.code).toBe('deadline_passed');
    }
  });
});

describe('catastrophe reset', () => {
  it('forks a new loop at the 08:00 checkpoint and preserves the failed timeline', async () => {
    const harness = await streetHarness();
    collect(harness, 'ward_dispatch');
    burnToDeadline(harness);

    const failedBranchId = harness.session.getActiveBranchId();
    const failedState = harness.session.getState();
    expect(failedState.catastrophe.status).toBe('occurred');

    const result = harness.session.resetLoop();
    expect(result.status).toBe('accepted');

    const state = harness.session.getState();
    expect(state.tick).toBe(0);
    expect(state.loop.index).toBe(2);
    expect(state.loop.resetCount).toBe(1);
    expect(state.catastrophe.status).toBe('pending');
    expect(state.facts['evidence.ward_dispatch']).toBeUndefined();
    expect(state.branchId).not.toBe(failedBranchId);

    const branch = state.branches.find((item) => item.branchId === state.branchId);
    expect(branch?.forkReason).toBe('loop');
    expect(branch?.parentBranchId).toBe(failedBranchId);

    const preserved = harness.session.getBranchState(failedBranchId);
    expect(preserved?.catastrophe.status).toBe('occurred');
    expect(preserved?.facts['evidence.ward_dispatch']).toBeDefined();
  });

  it('rejects a reset while the day is still running', async () => {
    const harness = await streetHarness();
    const result = harness.session.resetLoop();
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.rejection?.message).toContain('nothing to reset');
    }
  });
});

describe('cross-loop ECHO', () => {
  it('keeps each loop separate and reports a disagreement without deciding it', async () => {
    const harness = await streetHarness();
    collect(harness, 'vendor_testimony');
    const firstValue = harness.session.getState().facts['evidence.vendor_testimony']?.value;
    harness.session.dispatch({
      actionType: 'fact.assert',
      actorId: 'player_local',
      params: { key: 'debug.counter', value: 1, sourceRef: 'test.loop.one' },
    });

    burnToDeadline(harness);
    expect(harness.session.resetLoop().status).toBe('accepted');
    harness.session.dispatch({
      actionType: 'fact.assert',
      actorId: 'player_local',
      params: { key: 'debug.counter', value: 2, sourceRef: 'test.loop.two' },
    });

    const echo = new EchoService(harness.session, STAGE5_CONTENT);
    const answer = echo.ask({
      kind: 'acrossLoops',
      evidenceKey: 'debug.counter',
    });

    expect(answer.branchLabel).toContain('loop');
    expect(answer.claims.some((claim) => claim.text.includes('Loop 1'))).toBe(true);
    expect(answer.claims.some((claim) => claim.text.includes('Loop 2'))).toBe(true);
    expect(answer.claims.some((claim) => claim.citations.some((c) => c.kind === 'branch'))).toBe(true);
    expect(JSON.stringify(firstValue)).toContain('ivo');
    expect(
      answer.claims.some((claim) =>
        claim.text.includes('discrepancy does not establish which value is correct'),
      ),
    ).toBe(true);
  });

  it('does not leak a branch fact into the next loop state', async () => {
    const harness = await streetHarness();
    collect(harness, 'vendor_testimony');
    burnToDeadline(harness);
    harness.session.resetLoop();

    expect(harness.session.getState().facts['evidence.vendor_testimony']).toBeUndefined();
    const echo = new EchoService(harness.session, STAGE5_CONTENT);
    const answer = echo.ask({ kind: 'acrossLoops', evidenceKey: 'evidence.vendor_testimony' });
    expect(answer.status).toBe('partial');
    expect(answer.missing.length).toBeGreaterThan(0);
  });
});

describe('MORROW plan policy', () => {
  it('never plans more than three minds and records the plan as a trace', async () => {
    const harness = await streetHarness();
    const state = harness.session.getState();

    const plan = buildMorrowPlan({
      sessionId: String(state.sessionId),
      branchId: String(state.branchId),
      loopIndex: state.loop.index,
      tick: state.tick,
      seed: 'plan-seed',
      roster: CITY_ROSTER,
      focus: ['ward_dispatch', 'vendor_testimony'],
      collected: [],
      priorLoops: [],
    });
    expect(plan.targets.length).toBeLessThanOrEqual(3);

    expect(submitPlan(harness, plan).status).toBe('accepted');
    expect(harness.session.getState().morrowPlan?.planId).toBe(plan.planId);
    expect(
      harness.session.getLineageEvents().some((event) => event.type === 'morrow.plan.selected'),
    ).toBe(true);

    const duplicate = submitPlan(harness, { ...plan, planId: 'plan_other' });
    expect(duplicate.status).toBe('rejected');

    const four = planFor(state, ['npc_ivo', 'npc_sable', 'npc_lyra', 'npc_vane']);
    const rejected = submitPlan(harness, four);
    expect(rejected.status).toBe('rejected');
  });

  it('is deterministic for identical inputs', async () => {
    const harness = await streetHarness();
    const state = harness.session.getState();
    const input = {
      sessionId: String(state.sessionId),
      branchId: String(state.branchId),
      loopIndex: state.loop.index,
      tick: state.tick,
      seed: 'deterministic-plan',
      roster: CITY_ROSTER,
      focus: ['relay_7_log'],
      collected: ['relay_7_log'],
      priorLoops: [],
    };
    expect(buildMorrowPlan(input)).toEqual(buildMorrowPlan(input));
  });

  it('discounts a tactic that failed in an earlier loop', async () => {
    const weights = tacticWeights([
      {
        loopIndex: 1,
        tactic: 'discredit_witness',
        targets: ['npc_ivo'],
        outcome: 'averted',
      },
    ]);
    expect(weights.discredit_witness).toBeLessThan(1);

    const harness = await streetHarness();
    const state = harness.session.getState();
    const plan = buildMorrowPlan({
      sessionId: String(state.sessionId),
      branchId: String(state.branchId),
      loopIndex: 2,
      tick: 0,
      seed: 'adaptive-plan',
      roster: CITY_ROSTER,
      focus: ['ward_dispatch'],
      collected: [],
      priorLoops: [
        {
          loopIndex: 1,
          tactic: 'discredit_witness',
          targets: ['npc_ivo'],
          outcome: 'averted',
        },
      ],
    });
    expect(plan.tactic).not.toBe('discredit_witness');
  });

  it('reads retained branch outcomes back into the policy', async () => {
    const harness = await streetHarness();
    burnToDeadline(harness);
    const branches = harness.session.listBranches();
    expect(branches[0]?.catastropheStatus).toBe('occurred');
    const records = priorLoopsFromBranches(branches);
    expect(Array.isArray(records)).toBe(true);
  });
});

describe('shaped testimony', () => {
  it('marks Ivo’s claim as contaminated without changing canonical evidence elsewhere', async () => {
    const harness = await streetHarness();
    const state = harness.session.getState();
    const plan = planFor(state, ['npc_ivo']);
    expect(submitPlan(harness, plan).status).toBe('accepted');

    expect(collect(harness, 'vendor_testimony').status).toBe('accepted');
    const fact = harness.session.getState().facts['evidence.vendor_testimony'];
    expect(fact?.contaminated).toBe(true);
    expect(fact?.contaminationSource).toBe('npc_ivo');
    expect(fact?.confidence).toBeLessThan(0.8);

    // Physical records are untouched by testimony shaping.
    expect(collect(harness, 'ward_dispatch').status).toBe('accepted');
    expect(harness.session.getState().facts['evidence.ward_dispatch']?.contaminated).toBe(false);
  });

  it('requires the hardware record before pressing a hesitating witness', async () => {
    const harness = await streetHarness();
    submitPlan(harness, planFor(harness.session.getState(), ['npc_ivo']));
    collect(harness, 'ward_dispatch');
    collect(harness, 'vendor_testimony');

    const withoutRelay = harness.session.dispatch({
      actionType: 'challenge.complete',
      actorId: 'player_local',
      params: {
        challengeId: 'challenge_hesitation',
        challengeType: 'contradiction_questioning',
        answer: { question: 'ask_route_seal' },
      },
    });
    expect(withoutRelay.status).toBe('rejected');
    if (withoutRelay.status === 'rejected') {
      expect(withoutRelay.rejection?.message).toContain('Relay 7');
    }

    collect(harness, 'relay_7_log');
    const anchored = harness.session.dispatch({
      actionType: 'challenge.complete',
      actorId: 'player_local',
      params: {
        challengeId: 'challenge_hesitation',
        challengeType: 'contradiction_questioning',
        answer: { question: 'ask_route_seal' },
      },
    });
    expect(anchored.status).toBe('accepted');
  });
});
