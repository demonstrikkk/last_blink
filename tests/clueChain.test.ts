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
  it('walks the core evidence chain to MORROW termination inside one day', async () => {
    const { session } = await harness();

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
    expect(
      projected.evidence.find((item) => item.evidenceId === 'freight_log')?.collected,
    ).toBe(true);

    expect(collect(session, 'depot_terminal').status).toBe('accepted');
    expect(collect(session, 'plaza_terminal').status).toBe('accepted');
    expect(collect(session, 'archive_record').status).toBe('accepted');

    expect(targetAvailable(view(session), 'morrow_analysis')).toBe(true);
    expect(choose(session, 'node.morrow.analysis', 'correlate').status).toBe('accepted');
    expect(view(session).morrowMechanism).toBe('root_manual_command');

    expect(collect(session, 'human_cost').status).toBe('accepted');
    expect(targetAvailable(view(session), 'morrow_terminate')).toBe(true);

    const termination = choose(session, 'node.morrow.terminate', 'terminate');
    expect(termination.status).toBe('accepted');

    projected = view(session);
    expect(projected.morrowTerminated).toBe(true);
    expect(projected.endingId).toBe('ending.second_settlement');
    expect(projected.ending?.title).toBe('The Second Settlement');
    expect(session.getState().tick).toBe(480);
    expect(projected.clock.label).toBe('16:00');
  });

  it('runs out of daylight before an exhaustive evidence sweep', async () => {
    const { session } = await harness();
    const sweep = [
      'relay_7_log',
      'clue_conduit',
      'clue_guestbook',
      'freight_log',
      'clue_locker',
      'depot_terminal',
      'plaza_terminal',
      'archive_record',
      'ward_dispatch',
      'human_cost',
    ];
    for (const evidenceId of sweep) {
      expect(collect(session, evidenceId).status).toBe('accepted');
    }
    expect(session.getState().tick).toBe(600);
    expect(session.getState().catastrophe.status).toBe('occurred');

    const late = collect(session, 'vendor_testimony');
    expect(late.status).toBe('rejected');
    if (late.status === 'rejected') {
      expect(late.rejection?.code).toBe('deadline_passed');
    }
  });

  it('refuses termination before the mechanism and human cost are established', async () => {
    const { session } = await harness();
    collect(session, 'clue_guestbook');
    choose(session, 'node.frequency.puzzle', 'tune');
    collect(session, 'depot_terminal');
    collect(session, 'plaza_terminal');
    collect(session, 'archive_record');

    const early = choose(session, 'node.morrow.terminate', 'terminate');
    expect(early.status).toBe('rejected');
    if (early.status === 'rejected') {
      expect(early.rejection?.code).toBe('invalid_action');
    }
    expect(view(session).morrowTerminated).toBe(false);
    expect(targetAvailable(view(session), 'morrow_terminate')).toBe(false);
  });

  it('keeps the depot locker frequency check available after the console is tuned', async () => {
    const { session } = await harness();
    expect(collect(session, 'clue_guestbook').status).toBe('accepted');
    expect(choose(session, 'node.frequency.puzzle', 'tune').status).toBe('accepted');
    expect(collect(session, 'clue_locker').status).toBe('accepted');
    expect(view(session).frequencyMatch).toBe('434.8MHz');
    expect(session.getState().tick).toBe(180);
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
