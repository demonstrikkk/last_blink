import { describe, expect, it } from 'vitest';
import { StaticContentPort } from '../src/engine/index.js';
import { STAGE4_CONTENT } from '../src/content/stage4Content.js';
import { deriveWorldView, targetAvailable } from '../src/world/worldView.js';
import { createHarness } from './helpers.js';

function stage4Harness() {
  return createHarness({ content: new StaticContentPort(STAGE4_CONTENT), seed: 'world-view-seed' });
}

describe('deriveWorldView', () => {
  it('projects initial canonical state into the HUD model', async () => {
    const { session } = await stage4Harness();
    const view = deriveWorldView(session.getState(), STAGE4_CONTENT);

    expect(view.district).toBe('aster');
    expect(view.curfew).toBe('active');
    expect(view.evidence).toHaveLength(1);
    expect(view.collectedEvidence).toHaveLength(0);
    expect(view.choiceResolved).toBe(false);
    expect(view.wardAlert).toBeNull();
    expect(view.sableStance).toBeNull();
    expect(view.consequence).toContain('No decision has been made');
    expect(view.anchors).toHaveLength(0);
    expect(targetAvailable(view, 'relay_7_log')).toBe(true);
  });

  it('reflects evidence collection and the derived hand-off fact', async () => {
    const { session } = await stage4Harness();
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });

    const view = deriveWorldView(session.getState(), STAGE4_CONTENT);
    expect(view.collectedEvidence).toHaveLength(1);
    expect(view.collectedEvidence[0]?.label).toBe('Relay 7 maintenance log');
    expect(view.relayReady).toBe(true);
    expect(view.evidenceFound).toBe(1);
    expect(targetAvailable(view, 'relay_7_log')).toBe(false);
  });

  it('shows the same consequence the engine derived, not a UI guess', async () => {
    const { session } = await stage4Harness();
    session.dispatch({
      actionType: 'choice.make',
      actorId: 'player_local',
      params: { nodeId: 'node.sable.relay', optionId: 'conceal' },
    });

    const view = deriveWorldView(session.getState(), STAGE4_CONTENT);
    expect(view.choiceResolved).toBe(true);
    expect(view.choice?.resolvedOptionId).toBe('conceal');
    expect(view.choice?.resolvedOptionLabel).toBe('Conceal the log');
    expect(view.wardAlert).toBe('suppressed');
    expect(view.sableStance).toBe('guarded');
    expect(view.consequence).toContain('Relay 7 stays dark');
    expect(view.choicesMade).toBe(1);
  });

  it('lists anchors once the engine records them', async () => {
    const { session } = await stage4Harness();
    session.recordAnchor('Lamp post — Relay 7');

    const view = deriveWorldView(session.getState(), STAGE4_CONTENT);
    expect(view.anchors).toHaveLength(1);
    expect(view.anchors[0]?.label).toBe('Lamp post — Relay 7');
    expect(view.anchors[0]?.stateHash).toMatch(/^[0-9a-f]{16}$/);
    expect(targetAvailable(view, 'anchor_lamp')).toBe(false);
  });

  it('never invents facts that are absent from canonical state', async () => {
    const { session } = await stage4Harness();
    session.dispatch({
      actionType: 'fact.assert',
      actorId: 'player_local',
      params: { key: 'debug.noise', value: 1 },
    });

    const view = deriveWorldView(session.getState(), STAGE4_CONTENT);
    expect(view.wardAlert).toBeNull();
    expect(view.choiceResolved).toBe(false);
    expect(view.collectedEvidence).toHaveLength(0);
  });
});
