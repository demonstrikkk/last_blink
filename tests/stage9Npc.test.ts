import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryNpcMemory,
  NpcCognitionController,
  StaticContentPort,
  buildNpcObservation,
  createIvoPolicy,
  createSablePolicy,
  type ActorId,
  type BranchId,
  type NpcDecisionProposal,
  type NpcId,
  type NpcPolicy,
} from '../src/engine/index.js';
import { IVO, SABLE, STAGE9_NPC_DEFINITIONS } from '../src/content/npcContent.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createHarness } from './helpers.js';

const SABLE_ID = SABLE.npcId;
const IVO_ID = IVO.npcId;

async function stage5Harness() {
  return createHarness({ content: new StaticContentPort(STAGE5_CONTENT) });
}

function collect(session: Awaited<ReturnType<typeof createHarness>>['session'], evidenceId: string) {
  const result = session.dispatch({
    actionType: 'evidence.collect',
    actorId: 'player_local',
    params: { evidenceId },
  });
  expect(result.status).toBe('accepted');
  return result;
}

function submit(session: Awaited<ReturnType<typeof createHarness>>['session'], proposal: NpcDecisionProposal, observationHash: string, basedOnStateVersion: number) {
  return session.dispatch({
    actionType: 'npc.propose',
    actorId: proposal.npcId as unknown as ActorId,
    params: { proposal, observationHash, basedOnStateVersion },
  });
}

describe('Stage 9 NPC cognition', () => {
  it('produces identical proposals for an identical observation and memory', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    const observation = buildNpcObservation(harness.session, {
      definition: SABLE,
      nowIso: () => '2026-02-01T00:00:00.000Z',
    });

    const policy = createSablePolicy();
    const first = policy.evaluate(observation, []);
    const second = policy.evaluate(observation, []);

    expect(first).toEqual(second);
    expect(first?.proposedActions).toEqual([
      { actionType: 'session.noop', targetId: null, params: {} },
    ]);
  });

  it('accepts a valid proposal through engine dispatch without mutating facts', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    const factsBefore = structuredClone(harness.session.getState().facts);
    const controller = new NpcCognitionController(harness.session, {
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });

    const turn = controller.run(SABLE_ID);

    expect(turn?.fallback).toBe(false);
    expect(turn?.proposal?.npcId).toBe(SABLE_ID);
    expect(turn?.result?.status).toBe('accepted');
    expect(turn?.result?.proposalId).toBe(turn?.proposal?.proposalId);
    expect(harness.session.getState().facts).toEqual(factsBefore);
    const evaluated = harness.session
      .getLineageEvents()
      .filter((event) => event.type === 'npc.proposal.evaluated');
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0]?.payload).toMatchObject({
      proposalId: turn?.proposal?.proposalId,
      npcId: SABLE_ID,
      status: 'accepted',
      reasonCode: 'no_effect',
    });
  });

  it('rejects stale proposals at a previous tick or state version', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    const controller = new NpcCognitionController(harness.session, {
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });
    const turn = controller.run(SABLE_ID);
    expect(turn?.proposal).not.toBeNull();

    const staleVersion = submit(
      harness.session,
      turn!.proposal!,
      turn!.observation.perceptionHash,
      Math.max(0, harness.session.getState().stateVersion - 1),
    );
    expect(staleVersion.status).toBe('rejected');
    expect(staleVersion.rejection?.code).toBe('stale_state');

    const staleTickProposal = {
      ...turn!.proposal!,
      proposalId: `prp_${'a'.repeat(16)}`,
      tick: turn!.proposal!.tick + 1,
    } as NpcDecisionProposal;
    const staleTick = submit(
      harness.session,
      staleTickProposal,
      turn!.observation.perceptionHash,
      harness.session.getState().stateVersion,
    );
    expect(staleTick.status).toBe('rejected');
    expect(staleTick.rejection?.code).toBe('stale_state');
  });

  it('rejects wrong actors, wrong branches and malformed proposals', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    const controller = new NpcCognitionController(harness.session, {
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });
    const turn = controller.run(SABLE_ID);
    const proposal = turn!.proposal!;
    const stateVersion = harness.session.getState().stateVersion;

    const wrongActor = harness.session.dispatch({
      actionType: 'npc.propose',
      actorId: IVO_ID as unknown as ActorId,
      params: {
        proposal,
        observationHash: turn!.observation.perceptionHash,
        basedOnStateVersion: stateVersion,
      },
    });
    expect(wrongActor.status).toBe('rejected');
    expect(wrongActor.rejection?.code).toBe('invalid_action');

    const wrongBranch = submit(
      harness.session,
      {
        ...proposal,
        proposalId: `prp_${'b'.repeat(16)}`,
        branchId: 'brn_other' as typeof proposal.branchId,
      } as NpcDecisionProposal,
      turn!.observation.perceptionHash,
      stateVersion,
    );
    expect(wrongBranch.status).toBe('rejected');
    expect(wrongBranch.rejection?.code).toBe('invalid_action');

    const malformed = harness.session.dispatch({
      actionType: 'npc.propose',
      actorId: SABLE_ID as unknown as ActorId,
      params: { proposal: { nonsense: true }, observationHash: 'bad', basedOnStateVersion: 0 },
    });
    expect(malformed.status).toBe('rejected');
    expect(malformed.rejection?.code).toBe('invalid_action');
  });

  it('rejects duplicate proposals and a second proposal in the same tick', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    const controller = new NpcCognitionController(harness.session, {
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });
    const turn = controller.run(SABLE_ID);
    expect(turn?.result?.status).toBe('accepted');

    const duplicate = submit(
      harness.session,
      turn!.proposal!,
      turn!.observation.perceptionHash,
      harness.session.getState().stateVersion,
    );
    expect(duplicate.status).toBe('rejected');
    expect(duplicate.rejection?.code).toBe('duplicate');

    const second = submit(
      harness.session,
      {
        ...turn!.proposal!,
        proposalId: `prp_${'c'.repeat(16)}`,
        rationale: 'A different but still valid Stage 9 no-op proposal.',
      } as NpcDecisionProposal,
      turn!.observation.perceptionHash,
      harness.session.getState().stateVersion,
    );
    expect(second.status).toBe('rejected');
    expect(second.rejection?.code).toBe('duplicate');

    expect(controller.run(SABLE_ID)).toBeNull();
  });

  it('keeps cognition memory isolated by branch and records event provenance', async () => {
    const harness = await stage5Harness();
    const parentId = harness.session.getActiveBranchId();
    collect(harness.session, 'relay_7_log');
    const controller = new NpcCognitionController(harness.session, {
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });

    const parentTurn = controller.run(SABLE_ID);
    expect(parentTurn?.memory?.provenance.sourceEventIds).toEqual(
      parentTurn?.result?.eventIds,
    );

    const anchor = harness.session.recordAnchor('stage9-isolation');
    expect(anchor.status).toBe('accepted');
    const anchorId = harness.session.getState().anchors[0]!.anchorId;
    const fork = harness.session.forkTimeline(anchorId, 'NPC isolation');
    expect(fork.branchId).not.toBeNull();
    const childId = fork.branchId!;
    expect(harness.session.switchBranch(childId).status).toBe('switched');

    const childTurn = controller.run(SABLE_ID);
    expect(childTurn?.result?.status).toBe('accepted');
    expect(childTurn?.proposal?.branchId).toBe(childId);

    expect(controller.recentMemory(SABLE_ID, parentId)).toHaveLength(1);
    expect(controller.recentMemory(SABLE_ID, childId)).toHaveLength(1);
    expect(controller.recentMemory(SABLE_ID, parentId)[0]?.branchId).toBe(parentId);
    expect(controller.recentMemory(SABLE_ID, childId)[0]?.branchId).toBe(childId);

    expect(harness.session.switchBranch(parentId).status).toBe('switched');
    const postFork = collect(harness.session, 'ward_dispatch');
    const parentEventIds = new Set(postFork.eventIds.map((eventId) => String(eventId)));
    expect(harness.session.switchBranch(childId).status).toBe('switched');

    const childObservation = controller.observe(SABLE_ID);
    expect(childObservation.visibleFacts.some((fact) => fact.key === 'evidence.ward_dispatch')).toBe(false);
    expect(
      childObservation.recentEventIds.some((eventId) => parentEventIds.has(String(eventId))),
    ).toBe(false);
  });

  it('filters observations by the NPC definition permissions', async () => {
    const harness = await stage5Harness();
    const sable = buildNpcObservation(harness.session, {
      definition: SABLE,
      nowIso: () => '2026-02-01T00:00:00.000Z',
    });
    const ivo = buildNpcObservation(harness.session, {
      definition: IVO,
      nowIso: () => '2026-02-01T00:00:00.000Z',
    });

    expect(sable.visibleFacts.every((fact) => SABLE.permissions.observableFactPrefixes.some((prefix) => fact.key.startsWith(prefix)))).toBe(true);
    expect(ivo.visibleFacts.every((fact) => IVO.permissions.observableFactPrefixes.some((prefix) => fact.key.startsWith(prefix)))).toBe(true);
    expect(sable.visibleFacts.some((fact) => fact.key === 'world.dispatch_continuity')).toBe(false);
    expect(ivo.visibleFacts.some((fact) => fact.key === 'npc.sable.trust')).toBe(false);
  });

  it('does not propose when the policy has no decision for the observation', async () => {
    const harness = await stage5Harness();
    const before = harness.session.getLineageEvents().length;
    const controller = new NpcCognitionController(harness.session, {
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });

    const turn = controller.run(SABLE_ID);
    expect(turn?.proposal).toBeNull();
    expect(turn?.result).toBeNull();
    expect(harness.session.getLineageEvents()).toHaveLength(before);
  });

  it('falls back deterministically when a policy throws', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    const throwing: NpcPolicy = {
      npcId: SABLE_ID,
      policyId: 'policy.npc.broken',
      policyVersion: '1.0.0',
      evaluate: () => {
        throw new Error('scripted policy fault');
      },
    };
    const controller = new NpcCognitionController(harness.session, {
      policies: [throwing],
      definitions: STAGE9_NPC_DEFINITIONS,
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });

    const turn = controller.run(SABLE_ID);
    expect(turn?.fallback).toBe(true);
    expect(turn?.fallbackReason).toBe('policy_exception');
    expect(turn?.proposal?.rationale).toContain('fallback');
    expect(turn?.result?.status).toBe('accepted');
    expect(turn?.memory?.tags).toContain('fallback_proposal');
  });

  it('falls back deterministically when a policy returns an invalid proposal', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    const invalid: NpcPolicy = {
      npcId: SABLE_ID,
      policyId: 'policy.npc.invalid',
      policyVersion: '1.0.0',
      evaluate: () => ({ not: 'a proposal' }) as unknown as NpcDecisionProposal,
    };
    const controller = new NpcCognitionController(harness.session, {
      policies: [invalid],
      definitions: STAGE9_NPC_DEFINITIONS,
      clock: new FixedClock('2026-02-01T00:00:00.000Z'),
    });

    const turn = controller.run(SABLE_ID);
    expect(turn?.fallback).toBe(true);
    expect(turn?.fallbackReason).toBe('invalid_output');
    expect(turn?.result?.status).toBe('accepted');
  });

  it('uses branch-scoped memory in a fresh in-memory adapter', async () => {
    const memory = new InMemoryNpcMemory();
    const harness = await stage5Harness();
    const branch = harness.session.getActiveBranchId() as BranchId;
    expect(memory.list(SABLE_ID as NpcId, branch)).toHaveLength(0);
    expect(memory.list(IVO_ID as NpcId, branch)).toHaveLength(0);
  });

  it('keeps Ivo independent and prefers his testimony policy', async () => {
    const harness = await stage5Harness();
    collect(harness.session, 'relay_7_log');
    collect(harness.session, 'ward_dispatch');
    collect(harness.session, 'vendor_testimony');
    const observation = buildNpcObservation(harness.session, {
      definition: IVO,
      nowIso: () => '2026-02-01T00:00:00.000Z',
    });
    const proposal = createIvoPolicy().evaluate(observation, []);
    expect(proposal?.rationale).toContain('name');
    expect(proposal?.rationale.toLowerCase()).not.toContain('sable');
  });
});
