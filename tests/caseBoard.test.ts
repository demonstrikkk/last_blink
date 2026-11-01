import { describe, expect, it } from 'vitest';
import { StaticContentPort } from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createHarness } from './helpers.js';

function harness() {
  return createHarness({ content: new StaticContentPort(STAGE5_CONTENT), seed: 'case-board-seed' });
}

function collect(session: Awaited<ReturnType<typeof harness>>['session'], evidenceId: string) {
  return session.dispatch({ actionType: 'evidence.collect', actorId: 'player_local', params: { evidenceId } });
}

describe('durable player case board', () => {
  it('records only validated challenge outcomes and rejects duplicates', async () => {
    const { session } = await harness();
    for (const evidenceId of ['relay_7_log', 'ward_dispatch', 'vendor_testimony']) collect(session, evidenceId);
    const valid = session.dispatch({ actionType: 'challenge.complete', actorId: 'player_local', params: { challengeId: 'challenge_timeline_relay7', challengeType: 'timeline_reconstruction', answer: { order: ['relay_7_log', 'ward_dispatch', 'vendor_testimony'] } } });
    expect(valid.status).toBe('accepted');
    expect(session.getState().challengeResults[0]?.outcome).toBe('verified_sequence');
    expect(session.dispatch({ actionType: 'challenge.complete', actorId: 'player_local', params: { challengeId: 'challenge_timeline_relay7', challengeType: 'timeline_reconstruction', answer: { order: ['relay_7_log', 'ward_dispatch', 'vendor_testimony'] } } }).status).toBe('rejected');
    expect(session.dispatch({ actionType: 'challenge.complete', actorId: 'player_local', params: { challengeId: 'challenge_dispatch_contradiction', challengeType: 'contradiction_questioning', answer: { question: 'declare_slip_definitive' } } }).status).toBe('rejected');
  });

  it('persists links and revisable hypotheses through save and restore', async () => {
    const setup = await harness();
    const { session } = setup;
    collect(session, 'ward_dispatch');
    collect(session, 'vendor_testimony');
    expect(session.dispatch({
      actionType: 'case.link',
      actorId: 'player_local',
      params: { linkId: 'link_dispatch_vendor', leftEvidenceId: 'ward_dispatch', rightEvidenceId: 'vendor_testimony', relation: 'contradicts', note: 'The witness denies the sealed route.' },
    }).status).toBe('accepted');
    expect(session.dispatch({
      actionType: 'case.hypothesis',
      actorId: 'player_local',
      params: { hypothesisId: 'theory_dispatch_lie', text: 'The official dispatch account was manufactured after the incident.', supportingEvidenceIds: ['vendor_testimony'], opposingEvidenceIds: ['ward_dispatch'] },
    }).status).toBe('accepted');
    collect(session, 'relay_7_log');
    expect(session.dispatch({ actionType: 'challenge.complete', actorId: 'player_local', params: { challengeId: 'challenge_timeline_relay7', challengeType: 'timeline_reconstruction', answer: { order: ['relay_7_log', 'ward_dispatch', 'vendor_testimony'] } } }).status).toBe('accepted');

    const restored = await (session.constructor as typeof import('../src/engine/index.js').DeterministicGameSession).restore(
      await session.save(),
      setup,
    );
    expect(restored.getState().caseLinks[0]?.note).toContain('sealed route');
    expect(restored.getState().hypotheses[0]?.status).toBe('inconclusive');
    expect(restored.getState().challengeResults[0]?.outcome).toBe('verified_sequence');
  });

  it('keeps player interpretations branch-scoped', async () => {
    const { session } = await harness();
    collect(session, 'ward_dispatch');
    expect(session.recordAnchor('case checkpoint').status).toBe('accepted');
    const anchor = session.getState().anchors[0]!;
    const fork = session.forkTimeline(anchor.anchorId, 'comparison');
    expect(fork.branchId).not.toBeNull();
    expect(session.switchBranch(fork.branchId!).status).toBe('switched');
    expect(session.dispatch({ actionType: 'case.hypothesis', actorId: 'player_local', params: { hypothesisId: 'theory_branch_only', text: 'This branch tests a different explanation.', supportingEvidenceIds: ['ward_dispatch'], opposingEvidenceIds: [] } }).status).toBe('accepted');
    expect(session.getState().hypotheses).toHaveLength(1);
    expect(session.switchBranch(session.listBranches()[0]!.branchId).status).toBe('switched');
    expect(session.getState().hypotheses).toHaveLength(0);
  });

  it('keeps challenge outcomes branch-scoped across a fork', async () => {
    const { session } = await harness();
    for (const evidenceId of ['relay_7_log', 'ward_dispatch', 'vendor_testimony']) collect(session, evidenceId);
    expect(session.dispatch({ actionType: 'challenge.complete', actorId: 'player_local', params: { challengeId: 'challenge_timeline_relay7', challengeType: 'timeline_reconstruction', answer: { order: ['relay_7_log', 'ward_dispatch', 'vendor_testimony'] } } }).status).toBe('accepted');

    expect(session.recordAnchor('challenge checkpoint').status).toBe('accepted');
    const parent = session.getActiveBranchId();
    const fork = session.forkTimeline(session.getState().anchors[0]!.anchorId, 'challenge comparison');
    expect(session.switchBranch(fork.branchId!).status).toBe('switched');
    expect(session.getState().challengeResults.map((result) => result.challengeId)).toEqual(['challenge_timeline_relay7']);
    expect(session.dispatch({ actionType: 'challenge.complete', actorId: 'player_local', params: { challengeId: 'challenge_dispatch_contradiction', challengeType: 'contradiction_questioning', answer: { question: 'ask_route_seal' } } }).status).toBe('accepted');

    expect(session.switchBranch(parent).status).toBe('switched');
    expect(session.getState().challengeResults.map((result) => result.challengeId)).toEqual(['challenge_timeline_relay7']);
  });
});
