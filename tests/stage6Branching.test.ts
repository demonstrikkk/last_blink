import { describe, expect, it } from 'vitest';
import {
  DeterministicGameSession,
  FixedClock,
  InMemoryLogger,
  InMemoryPersistence,
  StaticContentPort,
  type ActionResult,
  type BranchId,
  type GameState,
  type SessionId,
} from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createHarness, makePlayer, type SessionHarness } from './helpers.js';

/**
 * Stage 6 acceptance: real timeline branching through GameSession.
 *
 * Each test plays the canonical street far enough to have something worth
 * forking, then forks from a recorded anchor and proves that the two timelines
 * are genuinely independent canonical states - not a UI rewind.
 */

const STREET = new StaticContentPort(STAGE5_CONTENT);

async function streetHarness(): Promise<SessionHarness> {
  return createHarness({ content: STREET, seed: 'stage6-branch-seed' });
}

function play(harness: SessionHarness): void {
  const { session } = harness;
  session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId: 'relay_7_log' },
  });
}

function make(harness: SessionHarness, action: unknown): ActionResult {
  return harness.session.dispatch(action);
}

function collect(harness: SessionHarness, evidenceId: string): ActionResult {
  return make(harness, {
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId },
  });
}

function decide(harness: SessionHarness, nodeId: string, optionId: string): ActionResult {
  return make(harness, {
    actionType: 'choice.make',
    actorId: 'player_local',
    params: { nodeId, optionId },
  });
}

function assertScar(harness: SessionHarness, key: string): ActionResult {
  return make(harness, {
    actionType: 'fact.assert',
    actorId: 'player_local',
    params: { key, value: 'blink-residue', kind: 'observed', sourceRef: 'test.scar' },
  });
}

function factsOf(state: GameState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state.facts).map(([key, fact]) => [key, fact.value]),
  );
}

describe('stage 6 - fork from an anchor', () => {
  it('creates a child timeline at the anchor checkpoint and leaves the parent active', async () => {
    const harness = await streetHarness();
    const { session } = harness;

    play(harness);
    const anchorResult = session.recordAnchor('Before the relay decision');
    expect(anchorResult.status).toBe('accepted');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');

    const parentBefore = session.getSnapshot().hash;
    const fork = session.forkTimeline(anchor.anchorId, 'Second attempt');
    expect(fork.result.status).toBe('accepted');
    expect(fork.branchId).not.toBeNull();

    // The original timeline is still active straight after the fork.
    expect(session.getActiveBranchId()).toBe(session.getState().branchId);
    expect(session.getState().branchId).not.toBe(fork.branchId);
    // Its only write is the ancestry event itself.
    expect(session.getSnapshot().hash).not.toBe(parentBefore);
    expect(session.getState().branches).toHaveLength(2);

    const parentBranch = session.getState().branches[0];
    const child = session.getState().branches[1];
    expect(child?.parentBranchId).toBe(parentBranch?.branchId);
    expect(child?.forkedAtAnchorId).toBe(anchor.anchorId);
    expect(child?.forkedAtStateVersion).toBe(anchor.stateVersion);
    expect(child?.forkedAtTick).toBe(anchor.tick);
    expect(child?.forkedAtEventSequenceNo).toBe(anchor.eventSequenceNo);
    expect(child?.forkedAtStateHash).toBe(anchor.stateHash);
  });

  it('gives the child exactly the checkpoint facts, not the parent’s later discoveries', async () => {
    const harness = await streetHarness();
    const { session } = harness;

    play(harness);
    session.recordAnchor('After the relay log');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const checkpointFacts = factsOf(session.getState());

    // Parent keeps going: collect more evidence after the anchor.
    expect(collect(harness, 'ward_dispatch').status).toBe('accepted');
    expect(collect(harness, 'vendor_testimony').status).toBe('accepted');
    const parentState = session.getState();
    expect(parentState.facts['evidence.ward_dispatch']).toBeDefined();

    const fork = session.forkTimeline(anchor.anchorId, 'Blink back');
    if (!fork.branchId) throw new Error('fork produced no branch');

    const childState = session.getBranchState(fork.branchId);
    if (!childState) throw new Error('child state missing');

    expect(childState.stateVersion).toBe(anchor.stateVersion);
    expect(childState.facts['evidence.relay_7']).toBeDefined();
    expect(childState.facts['evidence.ward_dispatch']).toBeUndefined();
    expect(childState.facts['evidence.vendor_testimony']).toBeUndefined();
    expect(factsOf(childState)).toEqual(checkpointFacts);

    // The parent state object was not rewritten by the child creation.
    expect(session.getState().facts['evidence.ward_dispatch']).toBeDefined();
    expect(session.getState().endingId).toBe(parentState.endingId);
  });

  it('rejects a fork from an anchor whose checkpoint cannot be reproduced', async () => {
    const harness = await streetHarness();
    const { session } = harness;
    play(harness);
    session.recordAnchor('Checkpoint');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const fork = session.forkTimeline(anchor.anchorId, 'First fork');
    expect(fork.result.status).toBe('accepted');

    const repeated = session.forkTimeline(anchor.anchorId, 'Second fork');
    expect(repeated.result.status).toBe('rejected');
    expect(repeated.result.rejection?.code).toBe('duplicate');

    const unknown = session.forkTimeline('anc_missing', 'Nowhere');
    expect(unknown.result.status).toBe('rejected');
    expect(unknown.result.rejection?.code).toBe('unknown_target');
  });
});

describe('stage 6 - switching timelines', () => {
  it('switches to the child, diverges, and restores both hashes exactly', async () => {
    const harness = await streetHarness();
    const { session } = harness;

    play(harness);
    session.recordAnchor('Fork point');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const parentBranchId = session.getState().branchId;
    const fork = session.forkTimeline(anchor.anchorId, 'Second attempt');
    if (!fork.branchId) throw new Error('fork produced no branch');

    const parentHashAfterFork = session.getSnapshot().hash;
    const childHashAtFork = session.getBranchHash(fork.branchId);
    if (!childHashAtFork) throw new Error('child hash missing');

    // Leave V1 untouched: V2 acts on its own copy.
    const switched = session.switchBranch(fork.branchId);
    expect(switched.status).toBe('switched');
    expect(session.getActiveBranchId()).toBe(fork.branchId);
    expect(session.getSnapshot().hash).toBe(childHashAtFork);

    expect(collect(harness, 'ward_dispatch').status).toBe('accepted');
    expect(decide(harness, 'node.sable.relay', 'share').status).toBe('accepted');
    const childAfterChoice = session.getSnapshot().hash;
    expect(childAfterChoice).not.toBe(childHashAtFork);
    expect(session.getBranchHash(parentBranchId)).toBe(parentHashAfterFork);

    // Back to V1: byte-identical state to the moment it was left.
    const back = session.switchBranch(parentBranchId);
    expect(back.status).toBe('switched');
    expect(session.getSnapshot().hash).toBe(parentHashAfterFork);
    expect(session.getState().choices).toHaveLength(0);
    expect(session.getState().facts['evidence.ward_dispatch']).toBeUndefined();

    // And forward again to V2.
    const forward = session.switchBranch(fork.branchId as BranchId);
    expect(forward.status).toBe('switched');
    expect(session.getSnapshot().hash).toBe(childAfterChoice);
  });

  it('fails safely: rejected switches leave the active snapshot untouched', async () => {
    const harness = await streetHarness();
    const { session } = harness;
    play(harness);
    session.recordAnchor('Fork point');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const fork = session.forkTimeline(anchor.anchorId, 'Second attempt');
    if (!fork.branchId) throw new Error('fork produced no branch');

    const before = session.getSnapshot();
    const eventsBefore = session.getRecentEvents(50).length;

    const unknown = session.switchBranch('brn_doesnotexist' as BranchId);
    expect(unknown.status).toBe('rejected');
    expect(unknown.code).toBe('unknown_branch');

    const same = session.switchBranch(session.getState().branchId);
    expect(same.status).toBe('rejected');
    expect(same.code).toBe('already_active');

    expect(session.getSnapshot()).toBe(before);
    expect(session.getSnapshot().hash).toBe(before.hash);
    expect(session.getState().stateVersion).toBe(before.state.stateVersion);
    expect(session.getRecentEvents(50).length).toBe(eventsBefore);
  });

  it('reports a stale snapshot when a restored session has no retained branch state', async () => {
    const clock = new FixedClock();
    const persistence = new InMemoryPersistence();
    const content = STREET;
    const deps = {
      clock,
      policy: { evaluate: () => ({ allowed: true as const }) },
      persistence,
      content,
      logger: new InMemoryLogger(),
    };

    const original = await DeterministicGameSession.create(
      {
        sessionId: 'ses_stage6restore' as SessionId,
        player: makePlayer(),
        seed: 'stage6-restore-seed',
      },
      deps,
    );
    original.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    original.recordAnchor('Checkpoint');
    const anchor = original.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const fork = original.forkTimeline(anchor.anchorId, 'Lost branch');
    if (!fork.branchId) throw new Error('fork produced no branch');
    const envelope = await original.save();

    const restored = await DeterministicGameSession.restore(envelope, deps);
    const stale = restored.switchBranch(fork.branchId);
    expect(stale.status).toBe('rejected');
    expect(stale.code).toBe('stale_snapshot');
    expect(restored.getSnapshot().hash).toBe(envelope.engineStateHash);
  });
});

describe('stage 6 - ancestry and scar memory', () => {
  it('separates shared ancestor events from branch-specific events', async () => {
    const harness = await streetHarness();
    const { session } = harness;

    play(harness);
    session.recordAnchor('Fork point');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const parentId = session.getState().branchId;
    const fork = session.forkTimeline(anchor.anchorId, 'Second attempt');
    if (!fork.branchId) throw new Error('fork produced no branch');

    // Parent-only work after the fork.
    session.advanceTick(1);
    const parentEventCount = session.getLineageEvents(parentId).length;
    session.switchBranch(fork.branchId);

    // Child ancestry stops at the checkpoint: the parent's tick event after the
    // anchor is not inherited, even though the fork event is.
    const childLineage = session.getLineageEvents(fork.branchId);
    expect(childLineage.every((event) => event.sequenceNo <= anchor.eventSequenceNo)).toBe(true);
    expect(childLineage.length).toBeLessThan(parentEventCount);

    // Child-only work is clearly its own.
    session.advanceTick(2);
    const childLineageAfter = session.getLineageEvents(fork.branchId);
    expect(childLineageAfter.length).toBeGreaterThan(childLineage.length);
    expect(
      childLineageAfter
        .slice(childLineage.length)
        .every((event) => event.branchId === fork.branchId),
    ).toBe(true);
  });

  it('carries only scar.* facts across the fork', async () => {
    const harness = await streetHarness();
    const { session } = harness;

    session.recordAnchor('Before the scar');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');

    // Everything below is after the checkpoint and must NOT cross, except the
    // scar channel.
    expect(collect(harness, 'relay_7_log').status).toBe('accepted');
    expect(assertScar(harness, 'scar.relay_echo').status).toBe('accepted');
    expect(assertScar(harness, 'debug.not_a_scar').status).toBe('accepted');

    const fork = session.forkTimeline(anchor.anchorId, 'Blink back');
    if (!fork.branchId) throw new Error('fork produced no branch');
    const child = session.getBranchState(fork.branchId);
    if (!child) throw new Error('child state missing');

    expect(child.facts['scar.relay_echo']?.value).toBe('blink-residue');
    expect(child.facts['scar.relay_echo']?.source.ref).toBe('scar.carry:scar.relay_echo');
    expect(child.facts['evidence.relay_7']).toBeUndefined();
    expect(child.facts['debug.not_a_scar']).toBeUndefined();
    expect(child.stateVersion).toBe(anchor.stateVersion + 1);
    expect(session.getLineageEvents(fork.branchId).at(-1)?.type).toBe('fact.asserted');
  });

  it('derives comparison from canonical states, not a parallel copy', async () => {
    const harness = await streetHarness();
    const { session } = harness;

    play(harness);
    session.recordAnchor('Fork point');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const parentId = session.getState().branchId;
    const fork = session.forkTimeline(anchor.anchorId, 'Second attempt');
    if (!fork.branchId) throw new Error('fork produced no branch');

    session.switchBranch(fork.branchId);
    collect(harness, 'ward_dispatch');
    decide(harness, 'node.sable.relay', 'conceal');

    const comparison = session.compareBranches(parentId, fork.branchId);
    expect(comparison.commonAncestorBranchId).toBe(parentId);
    expect(comparison.forkPoint?.anchorId).toBe(anchor.anchorId);
    expect(comparison.forkPoint?.stateHash).toBe(anchor.stateHash);
    expect(comparison.onlyInOther).toContain('evidence.ward_dispatch');
    expect(comparison.onlyInBase).not.toContain('evidence.relay_7');
    expect(comparison.sharedFactKeys).toContain('evidence.relay_7');

    const sable = comparison.choices.find((choice) => choice.nodeId === 'node.sable.relay');
    expect(sable).toEqual({
      nodeId: 'node.sable.relay',
      baseOptionId: null,
      otherOptionId: 'conceal',
      divergent: true,
    });
    expect(comparison.events.shared).toBeGreaterThan(0);
    expect(comparison.events.otherOnly).toBeGreaterThan(0);
    expect(comparison.base.stateHash).toBe(session.getBranchHash(parentId));
    expect(comparison.other.stateHash).toBe(session.getBranchHash(fork.branchId));
  });

  it('keeps a forked timeline playable through a different ending', async () => {
    const harness = await streetHarness();
    const { session } = harness;

    play(harness);
    session.recordAnchor('Fork point');
    const anchor = session.getState().anchors[0];
    if (!anchor) throw new Error('anchor missing');
    const fork = session.forkTimeline(anchor.anchorId, 'Second attempt');
    if (!fork.branchId) throw new Error('fork produced no branch');
    session.switchBranch(fork.branchId);

    collect(harness, 'ward_dispatch');
    decide(harness, 'node.sable.relay', 'share');
    collect(harness, 'vendor_testimony');
    decide(harness, 'node.vendor.silence', 'protect');
    decide(harness, 'node.ward.call', 'file');

    expect(session.getState().endingId).toBe('ending.open_record');
    const branches = session.listBranches();
    const child = branches.find((branch) => branch.branchId === fork.branchId);
    expect(child?.endingId).toBe('ending.open_record');
    expect(child?.checkpoint?.anchorId).toBe(anchor.anchorId);
  });
});
