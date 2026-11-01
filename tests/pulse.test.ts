import { describe, expect, it } from 'vitest';
import { StaticContentPort } from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { deriveWorldView } from '../src/world/worldView.js';
import { buildPulseReadout } from '../src/world/pulse.js';
import { createHarness } from './helpers.js';

async function stage5Harness() {
  return createHarness({
    content: new StaticContentPort(STAGE5_CONTENT),
    seed: 'pulse-readout-seed',
  });
}

describe('investigative pulse readout', () => {
  it('names the nearest reachable record and the remaining clock without spending time', async () => {
    const { session } = await stage5Harness();
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const before = session.getState().tick;

    const readout = buildPulseReadout(view, { x: 41, y: 29 });

    expect(readout.nearest?.targetId).toBe('relay_7_log');
    expect(readout.nearest?.distanceTiles).toBe(0);
    expect(readout.openLeads).toBeGreaterThan(0);
    expect(readout.missingEvidence).toBe(view.evidenceTotal);
    expect(readout.summary).toContain('PULSE //');
    expect(readout.summary).toContain('18:00');
    expect(session.getState().tick).toBe(before);
  });

  it('promotes the diner console once the guestbook makes the signal puzzle reachable', async () => {
    const { session } = await stage5Harness();
    const collected = session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'clue_guestbook' },
    });
    expect(collected.status).toBe('accepted');

    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const readout = buildPulseReadout(view, { x: 135, y: 34 });

    expect(readout.nearest?.targetId).toBe('frequency_console');
    expect(readout.nearest?.distanceTiles).toBe(4);
  });
});
