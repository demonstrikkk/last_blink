import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  MAX_MORROW_ESCALATION,
  MorrowController,
  StaticContentPort,
  createDeterministicMorrowPolicy,
  morrowObservationSchema,
  morrowProposalSchema,
  type ActionResult,
  type MorrowPolicy,
  type MorrowProposalEvaluatedEvent,
  type MorrowResponse,
} from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createHarness, type SessionHarness } from './helpers.js';

/**
 * Stage 7 acceptance: MORROW is a bounded, deterministic policy loop.
 *
 * The policy may only propose. Every state change goes through GameSession's
 * boundary validation, and the event log keeps both accepted and rejected
 * proposals.
 */

const STREET = new StaticContentPort(STAGE5_CONTENT);

async function streetHarness(seed = 'stage7-morrow-seed'): Promise<SessionHarness> {
  return createHarness({ content: STREET, seed });
}

function collect(harness: SessionHarness, evidenceId: string): ActionResult {
  return harness.session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId },
  });
}

function decide(harness: SessionHarness, nodeId: string, optionId: string): ActionResult {
  return harness.session.dispatch({
    actionType: 'choice.make',
    actorId: 'player_local',
    params: { nodeId, optionId },
  });
}

function intervene(
  harness: SessionHarness,
  response: MorrowResponse,
  proposalId: string,
  reasonCodes: string[] = ['EVIDENCE_PRESSURE'],
): ActionResult {
  const state = harness.session.getState();
  return harness.session.dispatch({
    actionType: 'morrow.intervene',
    actorId: 'system_morrow',
    params: {
      proposalId,
      policyId: 'policy.test.manual',
      policyVersion: '1.0.0',
      observationId: 'obs_manualobservation',
      observationHash: '0123456789abcdef',
      basedOnStateVersion: state.stateVersion,
      response,
      reasonCodes,
    },
  });
}

function morrowEvents(harness: SessionHarness) {
  return harness.session
    .getLineageEvents()
    .filter(
      (event) =>
        event.type === 'morrow.proposal.evaluated' || event.type === 'morrow.intervened',
    );
}

async function playToOpenRecord(harness: SessionHarness): Promise<void> {
  expect(collect(harness, 'relay_7_log').status).toBe('accepted');
  expect(decide(harness, 'node.sable.relay', 'share').status).toBe('accepted');
  expect(collect(harness, 'ward_dispatch').status).toBe('accepted');
  expect(collect(harness, 'vendor_testimony').status).toBe('accepted');
  expect(decide(harness, 'node.vendor.silence', 'protect').status).toBe('accepted');
  expect(decide(harness, 'node.ward.call', 'file').status).toBe('accepted');
}

describe('stage 7 - MORROW deterministic policy loop', () => {
  it('observes an untouched session without inventing pressure', async () => {
    const harness = await streetHarness();
    const controller = new MorrowController(harness.session, { clock: harness.clock });

    const turn = controller.run();
    expect(turn).not.toBeNull();
    expect(turn?.proposal.response).toBe('observe');
    expect(turn?.proposal.reasonCodes).toEqual(['BASELINE_OBSERVE']);
    expect(turn?.result.status).toBe('accepted');

    const state = harness.session.getState();
    expect(state.facts['morrow.response']?.value).toBe('observe');
    expect(state.facts['morrow.escalation']?.value).toBe(0);
    expect(state.facts['morrow.last_proposal']?.source.ref).toBe(
      'morrow.policy:policy.morrow.deterministic',
    );
  });

  it('warns after evidence and records proposal, intervention and facts atomically', async () => {
    const harness = await streetHarness();
    const controller = new MorrowController(harness.session, { clock: harness.clock });
    controller.run();
    expect(collect(harness, 'relay_7_log').status).toBe('accepted');

    const turn = controller.run();
    expect(turn?.proposal.response).toBe('warn');
    expect(turn?.result.status).toBe('accepted');

    const events = morrowEvents(harness);
    const accepted = events.filter(
      (event) => event.type === 'morrow.proposal.evaluated' && event.payload.status === 'accepted',
    );
    expect(accepted.length).toBeGreaterThanOrEqual(2);
    expect(events.some((event) => event.type === 'morrow.intervened')).toBe(true);

    const state = harness.session.getState();
    expect(state.facts['morrow.response']?.value).toBe('warn');
    expect(state.facts['morrow.response']?.kind).toBe('derived');
    expect(state.facts['morrow.escalation']?.value).toBe(0);
  });

  it('produces byte-identical proposals for identical observations', async () => {
    const harness = await streetHarness('stage7-determinism-seed');
    collect(harness, 'relay_7_log');

    const controller = new MorrowController(harness.session, { clock: new FixedClock() });
    const a = controller.plan();
    const b = controller.plan();

    expect(a.proposal).toEqual(b.proposal);
    expect(a.observation.features).toEqual(b.observation.features);
    expect(a.proposal.response).toBe('warn');

    // Same policy and same canonical observation, independent controller.
    const other = new MorrowController(harness.session, { clock: new FixedClock() }).plan();
    expect(other.proposal).toEqual(a.proposal);
  });

  it('rejects a proposal decided against an older state version', async () => {
    const harness = await streetHarness();
    const controller = new MorrowController(harness.session, { clock: harness.clock });
    const plan = controller.plan();
    collect(harness, 'relay_7_log');

    const result = harness.session.dispatch({
      actionType: 'morrow.intervene',
      actorId: 'system_morrow',
      params: {
        proposalId: plan.proposal.proposalId,
        policyId: plan.proposal.policyId,
        policyVersion: plan.proposal.policyVersion,
        observationId: plan.proposal.observationId,
        observationHash: plan.proposal.observationHash,
        basedOnStateVersion: plan.proposal.basedOnStateVersion,
        response: plan.proposal.response,
        reasonCodes: plan.proposal.reasonCodes,
      },
    });

    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('stale_state');
  });

  it('refuses unreachable transitions and non-MORROW actors', async () => {
    const harness = await streetHarness();
    const escalation = intervene(harness, 'escalate', 'prp_first');
    expect(escalation.status).toBe('rejected');
    expect(escalation.rejection?.code).toBe('policy_denied');

    const impostor = harness.session.dispatch({
      actionType: 'morrow.intervene',
      actorId: 'player_local',
      params: {
        proposalId: 'prp_impostor',
        policyId: 'policy.test.manual',
        policyVersion: '1.0.0',
        observationId: 'obs_manualobservation',
        observationHash: '0123456789abcdef',
        basedOnStateVersion: harness.session.getState().stateVersion,
        response: 'warn',
        reasonCodes: ['EVIDENCE_PRESSURE'],
      },
    });
    expect(impostor.status).toBe('rejected');
    expect(impostor.rejection?.code).toBe('invalid_action');
  });

  it('caps escalation at the ceiling and records the rejection', async () => {
    const harness = await streetHarness();
    expect(intervene(harness, 'warn', 'prp_step1').status).toBe('accepted');
    expect(intervene(harness, 'restrict', 'prp_step2').status).toBe('accepted');
    for (let step = 0; step < MAX_MORROW_ESCALATION; step += 1) {
      expect(intervene(harness, 'escalate', `prp_escalate_${step}`).status).toBe('accepted');
    }
    expect(harness.session.getState().facts['morrow.escalation']?.value).toBe(
      MAX_MORROW_ESCALATION,
    );

    const over = intervene(harness, 'escalate', 'prp_over_ceiling');
    expect(over.status).toBe('rejected');
    expect(over.rejection?.code).toBe('policy_denied');

    const rejected = harness.session
      .getLineageEvents()
      .filter(
        (event): event is MorrowProposalEvaluatedEvent =>
          event.type === 'morrow.proposal.evaluated' && event.payload.status === 'rejected',
      );
    expect(rejected.some((event) => event.payload.proposalId === 'prp_over_ceiling')).toBe(true);
  });

  it('refuses to reuse a proposal id after a rejection', async () => {
    const harness = await streetHarness();
    const rejected = intervene(harness, 'escalate', 'prp_rejected_replay');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejection?.code).toBe('policy_denied');

    const replay = intervene(harness, 'warn', 'prp_rejected_replay');
    expect(replay.status).toBe('rejected');
    expect(replay.rejection?.code).toBe('duplicate');
  });

  it('releases immediately when the story has already reached an ending', async () => {
    const harness = await streetHarness();
    await playToOpenRecord(harness);
    expect(harness.session.getState().endingId).toBe('ending.open_record');

    const controller = new MorrowController(harness.session, { clock: harness.clock });
    const turn = controller.run();
    expect(turn?.proposal.response).toBe('release');
    expect(turn?.proposal.reasonCodes).toEqual(['ENDING_RELEASE']);
    expect(turn?.result.status).toBe('accepted');
  });

  it('does not repeat the current posture on a later run', async () => {
    const harness = await streetHarness();
    const controller = new MorrowController(harness.session, { clock: harness.clock });
    controller.run();
    collect(harness, 'relay_7_log');
    controller.run();

    const before = morrowEvents(harness).length;
    const repeat = controller.run();
    expect(repeat).toBeNull();
    expect(morrowEvents(harness).length).toBe(before);
  });

  it('falls back to the baseline policy when a policy throws', async () => {
    const harness = await streetHarness();
    const broken: MorrowPolicy = {
      policyId: 'policy.test.broken',
      policyVersion: '1.0.0',
      propose() {
        throw new Error('policy exploded');
      },
    };
    const controller = new MorrowController(harness.session, {
      policy: broken,
      clock: harness.clock,
    });

    const turn = controller.run();
    expect(turn?.fallback).toBe(true);
    expect(turn?.proposal.response).toBe('observe');
    expect(morrowProposalSchema.safeParse(turn?.proposal).success).toBe(true);
  });

  it('keeps observations schema-valid and scoped to the active branch', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');
    harness.session.recordAnchor('before fork');
    const anchor = harness.session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');

    const fork = harness.session.forkTimeline(anchor.anchorId, 'branch two');
    if (!fork.branchId) throw new Error('fork missing');

    const controller = new MorrowController(harness.session, { clock: harness.clock });
    const observation = controller.observe();
    expect(morrowObservationSchema.safeParse(observation).success).toBe(true);
    expect(observation.branchId).toBe(harness.session.getActiveBranchId());

    expect(harness.session.switchBranch(fork.branchId).status).toBe('switched');
    const childObservation = controller.observe();
    expect(childObservation.branchId).toBe(fork.branchId);
    expect(childObservation.features.evidenceCount).toBe(1);
    expect(morrowProposalSchema.safeParse(createDeterministicMorrowPolicy().propose(childObservation)).success).toBe(true);
  });
});
