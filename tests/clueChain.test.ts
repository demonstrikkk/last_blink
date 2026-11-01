import { describe, expect, it } from 'vitest';
import { StaticContentPort, type ActionResult } from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { deriveWorldView, targetAvailable } from '../src/world/worldView.js';
import { createHarness } from './helpers.js';

function harness() {
  return createHarness({
    content: new StaticContentPort(STAGE5_CONTENT),
    seed: 'clue-chain-seed',
  });
}

type Session = Awaited<ReturnType<typeof harness>>['session'];

function collect(session: Session, evidenceId: string): ActionResult {
  return session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId },
  });
}

function choose(session: Session, nodeId: string, optionId: string): ActionResult {
  return session.dispatch({
    actionType: 'choice.make',
    actorId: 'player_local',
    params: { nodeId, optionId },
  });
}

function view(session: Session) {
  return deriveWorldView(session.getState(), STAGE5_CONTENT);
}

describe('Stage 13 clue chain', () => {
  it('walks optical jumper → depot → frequency → override → MORROW termination', async () => {
    const { session } = await harness();

    expect(collect(session, 'relay_7_log').status).toBe('accepted');
    expect(collect(session, 'clue_conduit').status).toBe('accepted');
    expect(collect(session, 'clue_guestbook').status).toBe('accepted');

    // The diner console is only reachable once the guestbook exists.
    expect(targetAvailable(view(session), 'frequency_console')).toBe(true);
    expect(choose(session, 'node.frequency.puzzle', 'tune').status).toBe('accepted');

    let projected = view(session);
    expect(projected.frequencyResolved).toBe(true);
    expect(
      projected.evidence.find((item) => item.evidenceId === 'surveillance_frequency')?.collected,
    ).toBe(true);

    expect(collect(session, 'freight_log').status).toBe('accepted');
    projected = view(session);
    expect(projected.relayDepotLink).toBe('confirmed');

    expect(collect(session, 'clue_locker').status).toBe('accepted');
    projected = view(session);
    expect(projected.frequencyMatch).toBe('434.8MHz');

    expect(collect(session, 'depot_terminal').status).toBe('accepted');
    expect(collect(session, 'plaza_terminal').status).toBe('accepted');
    expect(collect(session, 'archive_record').status).toBe('accepted');

    expect(targetAvailable(view(session), 'morrow_analysis')).toBe(true);
    expect(choose(session, 'node.morrow.analysis', 'correlate').status).toBe('accepted');
    expect(view(session).morrowMechanism).toBe('root_manual_command');

    // Termination is still gated on the human cost record.
    expect(collect(session, 'ward_dispatch').status).toBe('accepted');
    expect(collect(session, 'human_cost').status).toBe('accepted');
    expect(targetAvailable(view(session), 'morrow_terminate')).toBe(true);

    const termination = choose(session, 'node.morrow.terminate', 'terminate');
    expect(termination.status).toBe('accepted');

    projected = view(session);
    expect(projected.morrowTerminated).toBe(true);
    expect(projected.endingId).toBe('ending.second_settlement');
    expect(projected.ending?.title).toBe('The Second Settlement');
  });

  it('refuses termination before the mechanism and human cost are established', async () => {
    const { session } = await harness();
    collect(session, 'relay_7_log');
    collect(session, 'clue_conduit');
    collect(session, 'clue_guestbook');
    choose(session, 'node.frequency.puzzle', 'tune');
    collect(session, 'freight_log');
    collect(session, 'clue_locker');
    collect(session, 'depot_terminal');
    collect(session, 'plaza_terminal');
    collect(session, 'archive_record');

    const early = choose(session, 'node.morrow.terminate', 'terminate');
    expect(early.status).toBe('rejected');
    expect(view(session).morrowTerminated).toBe(false);
    expect(targetAvailable(view(session), 'morrow_terminate')).toBe(false);
  });

  it('keeps the original ward endings untouched by the clue chain', async () => {
    const { session } = await harness();
    collect(session, 'relay_7_log');
    choose(session, 'node.sable.relay', 'share');
    collect(session, 'ward_dispatch');
    collect(session, 'vendor_testimony');
    choose(session, 'node.vendor.silence', 'protect');
    choose(session, 'node.ward.call', 'file');

    const projected = view(session);
    expect(projected.endingId).toBe('ending.open_record');
    expect(projected.morrowTerminated).toBe(false);
  });
});
