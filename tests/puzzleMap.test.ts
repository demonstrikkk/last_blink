import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StaticContentPort } from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { deriveWorldView } from '../src/world/worldView.js';
import { PuzzleBody } from '../src/ui/PuzzleBody.js';
import { PuzzleSheet } from '../src/ui/PuzzleSheet.js';
import { getDialogueScript } from '../src/content/stage5Dialogue.js';
import { createHarness } from './helpers.js';

function stage5Harness() {
  return createHarness({
    content: new StaticContentPort(STAGE5_CONTENT),
    seed: 'puzzle-map-seed',
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

const noopChoice = () => {};
const noopChallenge = () => {};

describe('map-anchored puzzles', () => {
  it('renders the diner console locked, then unlocked after the guestbook', async () => {
    const { session } = await stage5Harness();
    let view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    let html = renderToStaticMarkup(
      createElement(PuzzleBody, {
        kind: 'signal',
        state: session.getState(),
        view,
        onMakeCaseChoice: noopChoice,
        onCompleteChallenge: noopChallenge,
      }),
    );
    expect(html).toContain('LOCKED');
    expect(html).toContain('Diner guestbook');

    collect(session, 'clue_guestbook');
    view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    html = renderToStaticMarkup(
      createElement(PuzzleBody, {
        kind: 'signal',
        state: session.getState(),
        view,
        onMakeCaseChoice: noopChoice,
        onCompleteChallenge: noopChallenge,
      }),
    );
    expect(html).not.toContain('LOCKED');
    expect(html).toContain('434.8 MHz');
    expect(html).toContain('Nocturne Diner');
  });

  it('renders the timeline as a clock rail with evidence cards, not a bare list', async () => {
    const { session } = await stage5Harness();
    for (const evidenceId of ['relay_7_log', 'ward_dispatch', 'vendor_testimony']) {
      collect(session, evidenceId);
    }
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const html = renderToStaticMarkup(
      createElement(PuzzleBody, {
        kind: 'timeline',
        state: session.getState(),
        view,
        onMakeCaseChoice: noopChoice,
        onCompleteChallenge: noopChallenge,
      }),
    );
    expect(html).toContain('03:06');
    expect(html).toContain('03:14');
    expect(html).toContain('03:22');
    expect(html).toContain('Relay 7 hardware log');
    expect(html).toContain('Ward dispatch slip');
    expect(html).toContain("Ivo&#x27;s account");
    expect(html).toContain('Verify the order');
    expect(html).toContain('Pick a record below');
  });

  it('renders the full timeline board even before the records are recovered', async () => {
    const { session } = await stage5Harness();
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const html = renderToStaticMarkup(
      createElement(PuzzleBody, {
        kind: 'timeline',
        state: session.getState(),
        view,
        onMakeCaseChoice: noopChoice,
        onCompleteChallenge: noopChallenge,
      }),
    );
    expect(html).toContain('03:06');
    expect(html).toContain('03:14');
    expect(html).toContain('03:22');
    expect(html).toContain('Relay 7 hardware log');
    expect(html).toContain('Ward dispatch slip');
    expect(html).toContain("Ivo&#x27;s account");
    expect(html).toContain('RECORD NOT RECOVERED');
    expect(html).toContain('Recover 3 records first');
    expect(html).not.toContain('This console is dark');
  });

  it('renders the contradiction puzzle only after the slip and the account exist', async () => {
    const { session } = await stage5Harness();
    collect(session, 'ward_dispatch');
    let view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    let html = renderToStaticMarkup(
      createElement(PuzzleBody, {
        kind: 'contradiction',
        state: session.getState(),
        view,
        onMakeCaseChoice: noopChoice,
        onCompleteChallenge: noopChallenge,
      }),
    );
    expect(html).toContain('LOCKED');
    expect(html).toContain('Vendor testimony');

    collect(session, 'vendor_testimony');
    view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    html = renderToStaticMarkup(
      createElement(PuzzleBody, {
        kind: 'contradiction',
        state: session.getState(),
        view,
        onMakeCaseChoice: noopChoice,
        onCompleteChallenge: noopChallenge,
      }),
    );
    expect(html).not.toContain('LOCKED');
    expect(html).toContain('Ask who sealed the route');
  });

  it('renders the bomb sheet with only the missing device links listed', async () => {
    const { session } = await stage5Harness();
    for (const evidenceId of ['clue_conduit', 'surveillance_frequency', 'archive_record', 'zeroing_order', 'clue_locker']) {
      collect(session, evidenceId);
    }
    const view = deriveWorldView(session.getState(), STAGE5_CONTENT);
    const script = getDialogueScript('relay_disarm', session.getState(), view);
    const html = renderToStaticMarkup(
      createElement(PuzzleSheet, {
        open: true,
        puzzle: 'bomb',
        onClose: noopChoice,
        state: session.getState(),
        view,
        context: script,
        onMakeCaseChoice: noopChoice,
        onCompleteChallenge: noopChallenge,
      }),
    );
    expect(html).toContain('Zeroing charge');
    expect(html).toContain('Relay 7 basement');
    expect(html).toContain('LOCKED');
    expect(html).toContain('Wire the charge');
  });
});
