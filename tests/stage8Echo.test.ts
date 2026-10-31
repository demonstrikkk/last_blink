import { describe, expect, it } from 'vitest';
import {
  EchoService,
  MorrowController,
  StaticContentPort,
  type ActionResult,
  type EchoAnswer,
} from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createHarness, type SessionHarness } from './helpers.js';

/**
 * Stage 8 acceptance: ECHO answers only from canonical records.
 *
 * The important assertions are negative: no citation, no claim of fact; no
 * answer may borrow evidence from another timeline, and "unknown" is a valid,
 * expected result rather than a failure.
 */

const STREET = new StaticContentPort(STAGE5_CONTENT);

async function streetHarness(seed = 'stage8-echo-seed'): Promise<SessionHarness> {
  return createHarness({ content: STREET, seed });
}

function echo(harness: SessionHarness): EchoService {
  return new EchoService(harness.session, STAGE5_CONTENT);
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

function expectSubstantiveClaimsCited(answer: EchoAnswer): void {
  for (const claim of answer.claims) {
    if (claim.kind === 'unavailable') continue;
    expect(claim.citations.length, `uncited claim: ${claim.text}`).toBeGreaterThan(0);
  }
}

describe('stage 8 - ECHO grounded retrieval', () => {
  it('answers an unknown fact with unknown rather than fabricating a value', async () => {
    const harness = await streetHarness();
    const answer = echo(harness).ask({ kind: 'fact', key: 'evidence.relay_7' });

    expect(answer.status).toBe('unknown');
    expect(answer.missing).toContain('evidence.relay_7');
    expect(answer.claims.every((claim) => claim.kind === 'unavailable')).toBe(true);
    expect(
      answer.claims
        .flatMap((claim) => claim.citations)
        .every((citation) => citation.kind === 'branch'),
    ).toBe(true);
    expect(answer.summary).toContain('cannot establish');
  });

  it('cites the fact and its source event when it can answer', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');

    const answer = echo(harness).ask({ kind: 'fact', key: 'evidence.relay_7' });
    expect(answer.status).toBe('grounded');
    expect(answer.branchId).toBe(harness.session.getActiveBranchId());

    const kinds = new Set(answer.claims.flatMap((claim) => claim.citations.map((c) => c.kind)));
    expect(kinds.has('fact')).toBe(true);
    expect(kinds.has('event')).toBe(true);
    expectSubstantiveClaimsCited(answer);

    const factCitation = answer.claims
      .flatMap((claim) => claim.citations)
      .find((citation) => citation.kind === 'fact');
    expect(factCitation?.branchId).toBe(harness.session.getActiveBranchId());
  });

  it('does not claim a decision was made before it happened', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');

    const answer = echo(harness).ask({ kind: 'decision', nodeId: 'node.sable.relay' });
    expect(answer.status).toBe('partial');
    expect(answer.summary).toContain('not on the record');
    expect(answer.claims.some((claim) => claim.kind === 'recorded_event')).toBe(false);
    expectSubstantiveClaimsCited(answer);
  });

  it('explains a committed decision from the choice, its event and recorded consequences', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');
    decide(harness, 'node.sable.relay', 'conceal');

    const answer = echo(harness).ask({ kind: 'decision', nodeId: 'node.sable.relay' });
    expect(answer.status).toBe('grounded');
    expect(answer.claims.some((claim) => claim.kind === 'recorded_event')).toBe(true);
    const choiceCitation = answer.claims
      .flatMap((claim) => claim.citations)
      .find((citation) => citation.kind === 'choice');
    expect(choiceCitation?.label).toBe('node.sable.relay');
    expectSubstantiveClaimsCited(answer);
  });

  it('explains MORROW from its accepted and rejected event records', async () => {
    const harness = await streetHarness();
    const controller = new MorrowController(harness.session, { clock: harness.clock });
    controller.run();
    collect(harness, 'relay_7_log');
    controller.run();

    const answer = echo(harness).ask({ kind: 'morrow' });
    expect(answer.status).toBe('grounded');
    const eventCitations = answer.claims
      .flatMap((claim) => claim.citations)
      .filter((citation) => citation.kind === 'event');
    expect(eventCitations.length).toBeGreaterThanOrEqual(2);
    expect(answer.summary).toContain('2 recorded interventions');
    expectSubstantiveClaimsCited(answer);
  });

  it('never borrows a post-fork discovery from the parent timeline', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');
    harness.session.recordAnchor('before the fork');
    const anchor = harness.session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const fork = harness.session.forkTimeline(anchor.anchorId, 'child timeline');
    if (!fork.branchId) throw new Error('fork missing');

    expect(harness.session.switchBranch(fork.branchId).status).toBe('switched');
    expect(collect(harness, 'ward_dispatch').status).toBe('accepted');

    const parentId = harness.session.getState().branches.find(
      (branch) => branch.branchId !== fork.branchId,
    )?.branchId;
    if (!parentId) throw new Error('parent missing');
    expect(harness.session.switchBranch(parentId).status).toBe('switched');
    expect(collect(harness, 'ward_dispatch').status).toBe('accepted');
    expect(collect(harness, 'vendor_testimony').status).toBe('accepted');

    const childAnswer = echo(harness).ask({
      kind: 'fact',
      key: 'evidence.vendor_testimony',
      branchId: fork.branchId,
    });
    expect(childAnswer.status).toBe('unknown');
    expect(childAnswer.branchId).toBe(fork.branchId);

    const childSituation = echo(harness).ask({ kind: 'situation', branchId: fork.branchId });
    expect(childSituation.claims.some((claim) => claim.text.includes('vendor_testimony'))).toBe(
      false,
    );
    expectSubstantiveClaimsCited(childSituation);
  });

  it('compares two timelines only through the explicit comparison query', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');
    harness.session.recordAnchor('comparison checkpoint');
    const anchor = harness.session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const fork = harness.session.forkTimeline(anchor.anchorId, 'alternate');
    if (!fork.branchId) throw new Error('fork missing');

    const baseId = harness.session.getActiveBranchId();
    expect(harness.session.switchBranch(fork.branchId).status).toBe('switched');
    expect(collect(harness, 'ward_dispatch').status).toBe('accepted');

    const answer = echo(harness).ask({
      kind: 'compare',
      baseBranchId: baseId,
      otherBranchId: fork.branchId,
    });
    expect(answer.status).toBe('grounded');
    expect(answer.claims.some((claim) => claim.text.includes('evidence.ward_dispatch'))).toBe(true);
    expect(
      answer.claims.flatMap((claim) => claim.citations).some((citation) => citation.kind === 'branch'),
    ).toBe(true);
    expectSubstantiveClaimsCited(answer);
  });

  it('explains an ending from the ending event and the rule that committed it', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');
    decide(harness, 'node.sable.relay', 'share');
    collect(harness, 'ward_dispatch');
    collect(harness, 'vendor_testimony');
    decide(harness, 'node.vendor.silence', 'protect');
    decide(harness, 'node.ward.call', 'file');

    const answer = echo(harness).ask({ kind: 'ending' });
    expect(answer.status).toBe('grounded');
    expect(answer.summary).toContain('The Open Record');
    const kinds = new Set(answer.claims.flatMap((claim) => claim.citations.map((c) => c.kind)));
    expect(kinds.has('event')).toBe(true);
    expect(kinds.has('ending')).toBe(true);
    expect(kinds.has('rule')).toBe(true);
    expectSubstantiveClaimsCited(answer);
  });

  it('returns unknown for an ending that has not happened', async () => {
    const harness = await streetHarness();
    const answer = echo(harness).ask({ kind: 'ending' });
    expect(answer.status).toBe('unknown');
    expect(answer.missing).toContain('ending.reached');
  });

  it('scopes situation answers to the requested branch', async () => {
    const harness = await streetHarness();
    collect(harness, 'relay_7_log');
    const active = harness.session.getActiveBranchId();
    const answer = echo(harness).ask({ kind: 'situation' });
    expect(answer.branchId).toBe(active);
    expect(answer.branchLabel).toContain('V1');
    expect(answer.claims.some((claim) => claim.citations.some((c) => c.kind === 'branch'))).toBe(
      true,
    );
  });
});
