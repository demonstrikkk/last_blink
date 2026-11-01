import { describe, expect, it } from 'vitest';
import {
  StaticContentPort,
  canonicalJson,
  type ActionResult,
  type DeterministicGameSession,
  type GameEvent,
} from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createHarness } from './helpers.js';

type Session = DeterministicGameSession;

function stage5Harness(seed = 'stage5-test-seed', sessionId?: string) {
  return createHarness({
    content: new StaticContentPort(STAGE5_CONTENT),
    seed,
    ...(sessionId ? { sessionId } : {}),
  });
}

function expectAccepted(result: ActionResult): void {
  expect(result.status).toBe('accepted');
  expect(result.rejection).toBeNull();
}

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

interface PathOptions {
  readonly relay: 'share' | 'conceal';
  readonly vendor: 'protect' | 'name';
  readonly call: 'file' | 'bury';
}

/** Drives the whole Stage 5 investigation in canonical order. */
async function playFullPath(session: Session, options: PathOptions): Promise<void> {
  expectAccepted(collect(session, 'relay_7_log'));
  expectAccepted(choose(session, 'node.sable.relay', options.relay));
  expectAccepted(collect(session, 'ward_dispatch'));
  expectAccepted(collect(session, 'vendor_testimony'));
  expectAccepted(choose(session, 'node.vendor.silence', options.vendor));
  expectAccepted(choose(session, 'node.ward.call', options.call));
}

function eventOf(events: readonly GameEvent[], eventId: string): GameEvent | undefined {
  return events.find((event) => event.eventId === eventId);
}

describe('Stage 5 evidence prerequisites and provenance', () => {
  it('collects evidence with record provenance, confidence and a matching source event', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));

    const fact = session.getState().facts['evidence.relay_7'];
    expect(fact).toBeDefined();
    expect(fact?.kind).toBe('observed');
    expect(fact?.source).toEqual({ kind: 'record', ref: 'record.relay_7.terminal' });
    expect(fact?.confidence).toBe(0.9);
    expect(fact?.sourceEventId).toBeDefined();

    const event = eventOf(session.getRecentEvents(50), fact?.sourceEventId as string);
    expect(event?.type).toBe('fact.asserted');
    if (event?.type === 'fact.asserted') {
      expect(event.payload.fact.factId).toBe(fact?.factId);
      expect(event.payload.fact.key).toBe('evidence.relay_7');
    }
  });

  it('records testimony as testimony, not as a ward record', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(collect(session, 'ward_dispatch'));
    expectAccepted(collect(session, 'vendor_testimony'));

    const fact = session.getState().facts['evidence.vendor_testimony'];
    expect(fact?.source).toEqual({ kind: 'testimony', ref: 'testimony.ivo.stall' });
    expect(fact?.confidence).toBe(0.8);
  });

  it('allows independent dispatch discovery before the relay log', async () => {
    const { session } = await stage5Harness();
    const result = collect(session, 'ward_dispatch');
    expectAccepted(result);
    expect(session.getState().facts['evidence.ward_dispatch']).toBeDefined();
  });

  it('allows testimony discovery before the dispatch slip exists', async () => {
    const { session } = await stage5Harness();
    const result = collect(session, 'vendor_testimony');
    expectAccepted(result);
    expect(session.getState().facts['evidence.vendor_testimony']).toBeDefined();
  });
});

describe('Stage 5 gated decisions', () => {
  it('refuses the Sable decision until the relay log has been read', async () => {
    const { session } = await stage5Harness();
    const before = canonicalJson(session.getState().facts);
    const result = choose(session, 'node.sable.relay', 'share');
    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('invalid_action');
    expect(result.rejection?.details.missing).toEqual(['evidence.relay_7']);
    expect(session.getState().choices).toHaveLength(0);
    expect(canonicalJson(session.getState().facts)).toBe(before);
  });

  it('opens the Sable decision once the evidence exists', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(choose(session, 'node.sable.relay', 'share'));
    expect(session.getState().facts['story.relay_choice']?.value).toBe('share');
  });

  it('refuses the vendor decision before the testimony is collected', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(collect(session, 'ward_dispatch'));
    const result = choose(session, 'node.vendor.silence', 'protect');
    expect(result.status).toBe('rejected');
    expect(result.rejection?.details.missing).toEqual(['evidence.vendor_testimony']);
  });

  it('refuses the ward call until both earlier decisions are resolved', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    const result = choose(session, 'node.ward.call', 'file');
    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('invalid_action');
    expect(result.rejection?.details.missing).toEqual([
      'story.relay_choice_resolved',
      'story.vendor_choice_resolved',
    ]);
  });

  it('keeps duplicate decisions rejected and canonical facts unchanged', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(choose(session, 'node.sable.relay', 'share'));
    const before = canonicalJson(session.getState().facts);
    const result = choose(session, 'node.sable.relay', 'conceal');
    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('duplicate');
    expect(canonicalJson(session.getState().facts)).toBe(before);
    expect(session.getState().facts['story.relay_choice']?.value).toBe('share');
  });
});

describe('Stage 5 delayed causal effects', () => {
  it('does not resolve dispatch continuity until the slip is recovered', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(choose(session, 'node.sable.relay', 'share'));
    expect(session.getState().facts['world.dispatch_continuity']?.value).toBe('unknown');

    expectAccepted(collect(session, 'ward_dispatch'));
    const fact = session.getState().facts['world.dispatch_continuity'];
    expect(fact?.value).toBe('unbroken');
    expect(fact?.kind).toBe('derived');
    expect(fact?.source).toEqual({ kind: 'derived', ref: 'rule.rul_dispatch_unbroken' });
  });

  it('severs continuity when the log was concealed before the slip was found', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(choose(session, 'node.sable.relay', 'conceal'));
    expectAccepted(collect(session, 'ward_dispatch'));
    expect(session.getState().facts['world.dispatch_continuity']?.value).toBe('severed');
    expect(session.getState().facts['world.dispatch_continuity']?.source.ref).toBe(
      'rule.rul_dispatch_severed',
    );
  });

  it('does not re-derive the delayed fact on later ticks', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(choose(session, 'node.sable.relay', 'share'));
    expectAccepted(collect(session, 'ward_dispatch'));
    const first = session.getState().facts['world.dispatch_continuity'];

    session.advanceTick(3);
    const second = session.getState().facts['world.dispatch_continuity'];
    expect(second?.factId).toBe(first?.factId);
    expect(second?.acquiredAtTick).toBe(first?.acquiredAtTick);
  });
});

describe('Stage 5 relationships and scrutiny', () => {
  it('derives Sable trust and stance from the relay decision', async () => {
    const shared = await stage5Harness();
    expectAccepted(collect(shared.session, 'relay_7_log'));
    expectAccepted(choose(shared.session, 'node.sable.relay', 'share'));
    expect(shared.session.getState().facts['npc.sable.stance']?.value).toBe('relieved');
    expect(shared.session.getState().facts['npc.sable.trust']?.value).toBe('trusted');
    expect(shared.session.getState().facts['world.ward_alert']?.value).toBe('raised');

    const concealed = await stage5Harness();
    expectAccepted(collect(concealed.session, 'relay_7_log'));
    expectAccepted(choose(concealed.session, 'node.sable.relay', 'conceal'));
    expect(concealed.session.getState().facts['npc.sable.stance']?.value).toBe('guarded');
    expect(concealed.session.getState().facts['npc.sable.trust']?.value).toBe('wary');
    expect(concealed.session.getState().facts['world.ward_alert']?.value).toBe('suppressed');
  });

  it('protects Ivo without raising scrutiny when the log is concealed', async () => {
    const { session } = await stage5Harness();
    await playFullPath(session, { relay: 'conceal', vendor: 'protect', call: 'bury' });

    const state = session.getState();
    expect(state.facts['npc.ivo.stance']?.value).toBe('protected');
    expect(state.facts['world.vendor_confidence']?.value).toBe('high');
    expect(state.facts['world.morrow_scrutiny']?.value).toBe('low');
  });

  it('raises scrutiny when Ivo is protected after sharing the log', async () => {
    const { session } = await stage5Harness();
    await playFullPath(session, { relay: 'share', vendor: 'protect', call: 'file' });
    const fact = session.getState().facts['world.morrow_scrutiny'];
    expect(fact?.value).toBe('elevated');
    expect(fact?.source.ref).toBe('rule.rul_scrutiny_elevated');
  });

  it('puts scrutiny at critical and exposes Ivo when he is named', async () => {
    const { session } = await stage5Harness();
    await playFullPath(session, { relay: 'share', vendor: 'name', call: 'file' });

    const state = session.getState();
    expect(state.facts['npc.ivo.stance']?.value).toBe('exposed');
    expect(state.facts['world.vendor_confidence']?.value).toBe('low');
    expect(state.facts['world.morrow_scrutiny']?.value).toBe('critical');
  });
});

describe('Stage 5 progression and endings', () => {
  it('advances the story phase monotonically', async () => {
    const { session } = await stage5Harness();
    expect(session.getState().facts['story.phase']?.value).toBe('arrival');

    expectAccepted(collect(session, 'relay_7_log'));
    expect(session.getState().facts['story.phase']?.value).toBe('investigation');

    expectAccepted(choose(session, 'node.sable.relay', 'share'));
    expect(session.getState().facts['story.phase']?.value).toBe('decision');

    expectAccepted(collect(session, 'ward_dispatch'));
    expectAccepted(collect(session, 'vendor_testimony'));
    expect(session.getState().facts['story.phase']?.value).toBe('decision');

    expectAccepted(choose(session, 'node.vendor.silence', 'protect'));
    expect(session.getState().facts['story.phase']?.value).toBe('accounting');

    expectAccepted(choose(session, 'node.ward.call', 'file'));
    expect(session.getState().facts['story.phase']?.value).toBe('resolved');

    session.advanceTick(2);
    expect(session.getState().facts['story.phase']?.value).toBe('resolved');
  });

  it('does not reach an ending before the ward call', async () => {
    const { session } = await stage5Harness();
    expectAccepted(collect(session, 'relay_7_log'));
    expectAccepted(choose(session, 'node.sable.relay', 'share'));
    expectAccepted(collect(session, 'ward_dispatch'));
    expectAccepted(collect(session, 'vendor_testimony'));
    expectAccepted(choose(session, 'node.vendor.silence', 'protect'));
    expect(session.getState().endingId).toBeNull();
  });

  it('reaches the open record with an intact chain and a protected witness', async () => {
    const { session } = await stage5Harness();
    await playFullPath(session, { relay: 'share', vendor: 'protect', call: 'file' });

    const state = session.getState();
    expect(state.endingId).toBe('ending.open_record');
    expect(state.facts['story.ending_id']?.value).toBe('ending.open_record');
    expect(state.facts['world.dispatch_continuity']?.value).toBe('unbroken');
    expect(state.facts['npc.ivo.stance']?.value).toBe('protected');
  });

  it('reaches the quiet street whenever the call is buried', async () => {
    for (const relay of ['share', 'conceal'] as const) {
      for (const vendor of ['protect', 'name'] as const) {
        const { session } = await stage5Harness();
        await playFullPath(session, { relay, vendor, call: 'bury' });
        expect(session.getState().endingId).toBe('ending.sealed_street');
      }
    }
  });

  it('reaches ward inquiry when a filed chain is broken', async () => {
    const { session } = await stage5Harness();
    await playFullPath(session, { relay: 'conceal', vendor: 'protect', call: 'file' });

    const state = session.getState();
    expect(state.endingId).toBe('ending.ward_inquiry');
    expect(state.facts['world.dispatch_continuity']?.value).toBe('severed');
  });

  it('reaches ward inquiry when a filed witness is named', async () => {
    const { session } = await stage5Harness();
    await playFullPath(session, { relay: 'share', vendor: 'name', call: 'file' });
    expect(session.getState().endingId).toBe('ending.ward_inquiry');
  });

  it('records exactly one ending event and keeps it after later ticks', async () => {
    const { session } = await stage5Harness();
    await playFullPath(session, { relay: 'share', vendor: 'protect', call: 'file' });

    const countEndings = (): number =>
      session.getRecentEvents(50).filter((event) => event.type === 'ending.reached').length;
    expect(countEndings()).toBe(1);

    session.advanceTick(5);
    expect(countEndings()).toBe(1);
    expect(session.getState().endingId).toBe('ending.open_record');
  });

  it('replays the full investigation deterministically from the same seed', async () => {
    const first = await stage5Harness('stage5-determinism', 'ses_stage5det');
    const second = await stage5Harness('stage5-determinism', 'ses_stage5det');

    await playFullPath(first.session, { relay: 'share', vendor: 'protect', call: 'file' });
    await playFullPath(second.session, { relay: 'share', vendor: 'protect', call: 'file' });

    expect(canonicalJson(first.session.getState())).toBe(canonicalJson(second.session.getState()));
  });
});

describe('Stage 5 content integrity', () => {
  it('declares presentation metadata for every rule-owned ending', () => {
    const declared = new Set(STAGE5_CONTENT.endings.map((ending) => ending.endingId));
    const ruleEndings = STAGE5_CONTENT.rules.flatMap((rule) =>
      rule.effects.filter((effect) => effect.kind === 'set_ending').map((effect) => effect.endingId),
    );
    expect(ruleEndings.length).toBeGreaterThanOrEqual(3);
    for (const endingId of ruleEndings) expect(declared.has(endingId)).toBe(true);
  });

  it('only requires facts that content can actually produce', () => {
    const produced = new Set<string>();
    for (const fact of STAGE5_CONTENT.initialFacts) produced.add(fact.key);
    for (const evidence of STAGE5_CONTENT.evidence) produced.add(evidence.factKey);
    for (const node of STAGE5_CONTENT.choices) {
      for (const option of node.options) {
        for (const effect of option.effects) produced.add(effect.key);
      }
    }
    for (const rule of STAGE5_CONTENT.rules) {
      for (const effect of rule.effects) {
        if (effect.kind === 'assert_fact') produced.add(effect.key);
      }
    }

    const required = [
      ...STAGE5_CONTENT.evidence.flatMap((evidence) => evidence.requires),
      ...STAGE5_CONTENT.choices.flatMap((node) => node.requires),
      ...STAGE5_CONTENT.objectives.flatMap((objective) => objective.requires),
    ];
    for (const key of required) expect(produced.has(key)).toBe(true);
  });
});
