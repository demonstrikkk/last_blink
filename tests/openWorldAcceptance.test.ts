import { describe, expect, it } from 'vitest';
import { StaticContentPort, type DeterministicGameSession } from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { getDialogueScript } from '../src/content/stage5Dialogue.js';
import { deriveWorldView } from '../src/world/worldView.js';
import { createHarness } from './helpers.js';

const CONTENT = new StaticContentPort(STAGE5_CONTENT);

async function session() {
  return (await createHarness({ content: CONTENT, seed: 'open-world-acceptance' })).session;
}

function collect(session: DeterministicGameSession, evidenceId: string): void {
  const result = session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId },
  });
  expect(result.status, evidenceId).toBe('accepted');
}

function choose(
  session: DeterministicGameSession,
  nodeId: string,
  optionId: string,
): void {
  const result = session.dispatch({
    actionType: 'choice.make',
    actorId: 'player_local',
    params: { nodeId, optionId },
  });
  expect(result.status, `${nodeId}:${optionId}`).toBe('accepted');
}

describe('open-world investigation acceptance', () => {
  it('keeps Ivo useful before the slip and deepens the return visit afterward', async () => {
    const game = await session();
    let view = deriveWorldView(game.getState(), STAGE5_CONTENT);
    const early = getDialogueScript('ivo', game.getState(), view);

    expect(early.lines.some((line) => line.text.includes('not carrying a sealed pouch'))).toBe(true);
    expect(early.grantsEvidenceId).toBeUndefined();

    collect(game, 'ward_dispatch');
    view = deriveWorldView(game.getState(), STAGE5_CONTENT);
    const returnVisit = getDialogueScript('ivo', game.getState(), view);
    expect(returnVisit.grantsEvidenceId).toBe('vendor_testimony');
    expect(returnVisit.lines.some((line) => line.text.includes('explicit contradiction'))).toBe(true);
  });

  it.each([
    ['dispatch → witness → relay', ['ward_dispatch', 'vendor_testimony', 'relay_7_log']],
    ['physical route → records → witness', ['clue_conduit', 'clue_guestbook', 'archive_record', 'vendor_testimony']],
    ['witness → dispatch → physical route', ['vendor_testimony', 'ward_dispatch', 'clue_locker', 'freight_log']],
  ])('supports %s without an unintended evidence-order dead end', async (_label, evidenceIds) => {
    const game = await session();
    for (const evidenceId of evidenceIds) collect(game, evidenceId);

    const view = deriveWorldView(game.getState(), STAGE5_CONTENT);
    expect(view.collectedEvidence.length).toBe(evidenceIds.length);
    expect(view.choices.find((choice) => choice.nodeId === 'node.sable.relay')?.available).toBe(
      evidenceIds.includes('relay_7_log'),
    );

    if (evidenceIds.includes('relay_7_log')) choose(game, 'node.sable.relay', 'share');
    if (evidenceIds.includes('vendor_testimony')) choose(game, 'node.vendor.silence', 'protect');

    const afterChoices = deriveWorldView(game.getState(), STAGE5_CONTENT);
    expect(afterChoices.choices.find((choice) => choice.nodeId === 'node.ward.call')?.available).toBe(
      evidenceIds.includes('relay_7_log') && evidenceIds.includes('vendor_testimony'),
    );
  });

  it('keeps unsupported Case Board pairs unproven while exposing grounded contradiction', async () => {
    const game = await session();
    collect(game, 'ward_dispatch');
    collect(game, 'vendor_testimony');
    collect(game, 'human_cost');
    const assessment = deriveWorldView(game.getState(), STAGE5_CONTENT).caseAssessment;

    const contradiction = assessment.links.find((link) => link.relation === 'contradicts');
    const unsupported = assessment.links.find(
      (link) => link.leftEvidenceId === 'plaza_terminal' && link.rightEvidenceId === 'depot_terminal',
    );
    expect(contradiction?.established).toBe(true);
    expect(unsupported?.established).toBe(false);
    expect(assessment.verdict).toBe('inconclusive');
  });
});
