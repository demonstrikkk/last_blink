import { describe, expect, it } from 'vitest';
import {
  StaticContentPort,
  type ActionResult,
  type DeterministicGameSession,
} from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { getDialogueScript } from '../src/content/stage5Dialogue.js';
import { deriveWorldView } from '../src/world/worldView.js';
import { createHarness } from './helpers.js';

type Session = DeterministicGameSession;

function testHarness(seed = 'stage11-reactivity-seed') {
  return createHarness({
    content: new StaticContentPort(STAGE5_CONTENT),
    seed,
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

describe('Stage 11: Narrative Investigation & Character Reactivity', () => {
  describe('Sable Reactivity and Dialogue Progression', () => {
    it('expresses initial caution before Relay 7 log is discovered', async () => {
      const { session } = await testHarness();
      const state = session.getState();
      const view = deriveWorldView(state, STAGE5_CONTENT);

      const script = getDialogueScript('sable', state, view);
      expect(script.displayName).toBe('Sable');
      expect(script.contextNote).toContain('Initial Caution');
      expect(script.lines[0]?.text).toContain('Keep your voice down');
      expect(script.lines.some((l) => l.text.includes('Relay 7 terminal'))).toBe(true);

      // Sable's decision is gated
      const sableChoice = view.choices.find((c) => c.nodeId === 'node.sable.relay');
      expect(sableChoice?.available).toBe(false);
      expect(sableChoice?.missing).toEqual(['evidence.relay_7']);
      expect(script.gate).toContain('Read the terminal yourself first');
    });

    it('unlocks evidence-dependent dialogue once Relay 7 is inspected', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));

      const state = session.getState();
      const view = deriveWorldView(state, STAGE5_CONTENT);

      const script = getDialogueScript('sable', state, view);
      expect(script.contextNote).toContain('Evidence Verified');
      expect(script.lines.some((l) => l.text.includes('Eight minutes'))).toBe(true);

      const sableChoice = view.choices.find((c) => c.nodeId === 'node.sable.relay');
      expect(sableChoice?.available).toBe(true);
      expect(sableChoice?.missing).toEqual([]);
    });

    it('reacts distinctly to sharing versus concealing the log', async () => {
      // Test Share Path
      const harnessShare = await testHarness('seed-share');
      expectAccepted(collect(harnessShare.session, 'relay_7_log'));
      expectAccepted(choose(harnessShare.session, 'node.sable.relay', 'share'));

      const shareState = harnessShare.session.getState();
      const shareView = deriveWorldView(shareState, STAGE5_CONTENT);
      const shareScript = getDialogueScript('sable', shareState, shareView);

      expect(shareState.facts['story.relay_choice']?.value).toBe('share');
      expect(shareState.facts['world.ward_alert']?.value).toBe('raised');
      expect(shareState.facts['npc.sable.stance']?.value).toBe('relieved');
      expect(shareState.facts['npc.sable.trust']?.value).toBe('trusted');
      expect(shareScript.stanceNote).toContain('relieved');
      expect(shareScript.lines.some((l) => l.text.includes('Ward alert is raised'))).toBe(true);

      // Test Conceal Path
      const harnessConceal = await testHarness('seed-conceal');
      expectAccepted(collect(harnessConceal.session, 'relay_7_log'));
      expectAccepted(choose(harnessConceal.session, 'node.sable.relay', 'conceal'));

      const concealState = harnessConceal.session.getState();
      const concealView = deriveWorldView(concealState, STAGE5_CONTENT);
      const concealScript = getDialogueScript('sable', concealState, concealView);

      expect(concealState.facts['story.relay_choice']?.value).toBe('conceal');
      expect(concealState.facts['world.ward_alert']?.value).toBe('suppressed');
      expect(concealState.facts['npc.sable.stance']?.value).toBe('guarded');
      expect(concealState.facts['npc.sable.trust']?.value).toBe('wary');
      expect(concealScript.stanceNote).toContain('guarded');
      expect(concealScript.lines.some((l) => l.text.includes('Alert is suppressed'))).toBe(true);
    });

    it('adapts later dialogue as investigation progresses with dispatch slip', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));
      expectAccepted(choose(session, 'node.sable.relay', 'share'));
      expectAccepted(collect(session, 'ward_dispatch'));

      const state = session.getState();
      const view = deriveWorldView(state, STAGE5_CONTENT);
      const script = getDialogueScript('sable', state, view);

      expect(script.contextNote).toContain('Investigation Ongoing');
      expect(script.lines.some((l) => l.text.includes('Ivo’s stall') || l.text.includes('Ivo'))).toBe(true);
    });

    it('gives branch-specific dialogue after BLINK timeline fork', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));
      expectAccepted(choose(session, 'node.sable.relay', 'share'));

      expectAccepted(session.recordAnchor('Lamp Post Anchor'));
      const anchor = session.getState().anchors[0]!;
      const fork = session.forkTimeline(anchor.anchorId, 'Forked Branch V2');
      expect(fork.branchId).toBeDefined();

      session.switchBranch(fork.branchId!);
      const forkedState = session.getState();
      const forkedView = deriveWorldView(forkedState, STAGE5_CONTENT);

      expect(forkedView.timeline.index).toBe(1);
      const script = getDialogueScript('sable', forkedState, forkedView);

      expect(script.contextNote).toContain('Temporal Recurrence');
      expect(script.lines.some((l) => l.text.includes('repeat this hour') || l.text.includes('timeline'))).toBe(true);
    });
  });

  describe('Ivo Testimony and Explicit Contradiction', () => {
    it('refuses testimony before ward dispatch slip is recovered', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));

      const state = session.getState();
      const view = deriveWorldView(state, STAGE5_CONTENT);
      const script = getDialogueScript('ivo', state, view);

      expect(script.contextNote).toContain('Initial Caution');
      expect(script.lines.some((l) => l.text.includes('dispatch slip from the north board'))).toBe(true);

      const ivoChoice = view.choices.find((c) => c.nodeId === 'node.vendor.silence');
      expect(ivoChoice?.available).toBe(false);
      expect(ivoChoice?.missing).toEqual(['evidence.vendor_testimony']);
    });

    it('exposes explicit contradiction between ward record and witness testimony', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));
      expectAccepted(choose(session, 'node.sable.relay', 'share'));
      expectAccepted(collect(session, 'ward_dispatch'));

      // Now Ivo's script unlocks testimony and exposes the contradiction
      const stateBefore = session.getState();
      const viewBefore = deriveWorldView(stateBefore, STAGE5_CONTENT);
      const script = getDialogueScript('ivo', stateBefore, viewBefore);

      expect(script.contextNote).toContain('Testimony Unlocked');
      expect(script.lines.some((l) => l.text.includes('contradiction'))).toBe(true);
      expect(script.lines.some((l) => l.text.includes('no sealed pouch'))).toBe(true);

      // Collect testimony
      expectAccepted(collect(session, 'vendor_testimony'));
      const state = session.getState();
      const view = deriveWorldView(state, STAGE5_CONTENT);

      const testimonyFact = state.facts['evidence.vendor_testimony'];
      expect(testimonyFact?.source.kind).toBe('testimony');
      expect(testimonyFact?.confidence).toBe(0.8);

      const testimonyView = view.evidence.find((e) => e.evidenceId === 'vendor_testimony');
      expect(testimonyView?.verificationStatus).toBe('unverified_claim');
      expect(testimonyView?.contradictionNote).toContain('official ward dispatch');

      const discrepancy = view.discrepancies.find((d) => d.id === 'discrepancy_runner');
      expect(discrepancy).toBeDefined();
      expect(discrepancy?.status).toBe('active');
    });

    it('protecting Ivo affects world confidence and MORROW scrutiny', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));
      expectAccepted(choose(session, 'node.sable.relay', 'share'));
      expectAccepted(collect(session, 'ward_dispatch'));
      expectAccepted(collect(session, 'vendor_testimony'));

      expectAccepted(choose(session, 'node.vendor.silence', 'protect'));
      const state = session.getState();
      const view = deriveWorldView(state, STAGE5_CONTENT);
      const script = getDialogueScript('ivo', state, view);

      expect(state.facts['npc.ivo.stance']?.value).toBe('protected');
      expect(state.facts['world.vendor_confidence']?.value).toBe('high');
      expect(state.facts['world.morrow_scrutiny']?.value).toBe('elevated');
      expect(script.contextNote).toContain('Witness Protected');
      expect(script.lines.some((l) => l.text.includes('kept my name off'))).toBe(true);
    });

    it('naming Ivo exposes witness and spikes MORROW scrutiny to critical', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));
      expectAccepted(choose(session, 'node.sable.relay', 'share'));
      expectAccepted(collect(session, 'ward_dispatch'));
      expectAccepted(collect(session, 'vendor_testimony'));

      expectAccepted(choose(session, 'node.vendor.silence', 'name'));
      const state = session.getState();
      const view = deriveWorldView(state, STAGE5_CONTENT);
      const script = getDialogueScript('ivo', state, view);

      expect(state.facts['npc.ivo.stance']?.value).toBe('exposed');
      expect(state.facts['world.vendor_confidence']?.value).toBe('low');
      expect(state.facts['world.morrow_scrutiny']?.value).toBe('critical');
      expect(script.contextNote).toContain('Witness Exposed');
      expect(script.lines.some((l) => l.text.includes('put my name directly'))).toBe(true);
    });
  });

  describe('Evidence Projection and Verification Distinction', () => {
    it('distinguishes verified record from unverified witness claims with provenance', async () => {
      const { session } = await testHarness();
      expectAccepted(collect(session, 'relay_7_log'));
      expectAccepted(choose(session, 'node.sable.relay', 'share'));
      expectAccepted(collect(session, 'ward_dispatch'));
      expectAccepted(collect(session, 'vendor_testimony'));

      const view = deriveWorldView(session.getState(), STAGE5_CONTENT);

      const relay = view.evidence.find((e) => e.evidenceId === 'relay_7_log');
      expect(relay?.verificationStatus).toBe('verified_record');
      expect(relay?.sourceKind).toBe('record');
      expect(relay?.confidence).toBe(0.9);
      expect(relay?.discoveryContext).toContain('terminal');

      const dispatch = view.evidence.find((e) => e.evidenceId === 'ward_dispatch');
      expect(dispatch?.verificationStatus).toBe('verified_record');
      expect(dispatch?.sourceKind).toBe('record');
      expect(dispatch?.confidence).toBe(0.95);

      const testimony = view.evidence.find((e) => e.evidenceId === 'vendor_testimony');
      expect(testimony?.verificationStatus).toBe('unverified_claim');
      expect(testimony?.sourceKind).toBe('testimony');
      expect(testimony?.confidence).toBe(0.8);
      expect(testimony?.contradictionNote).toBeDefined();
    });
  });

  describe('Objectives Progression and Canonical Fact Guards', () => {
    it('advances current objective strictly via canonical facts', async () => {
      const { session } = await testHarness();
      let view = deriveWorldView(session.getState(), STAGE5_CONTENT);
      expect(view.currentObjective?.objectiveId).toBe('obj_read_relay');
      expect(view.currentObjective?.completionCondition).toContain('evidence.relay_7');

      expectAccepted(collect(session, 'relay_7_log'));
      view = deriveWorldView(session.getState(), STAGE5_CONTENT);
      expect(view.currentObjective?.objectiveId).toBe('obj_decide_relay');
      expect(view.currentObjective?.completionCondition).toContain('story.relay_choice_resolved');

      expectAccepted(choose(session, 'node.sable.relay', 'share'));
      view = deriveWorldView(session.getState(), STAGE5_CONTENT);
      expect(view.currentObjective?.objectiveId).toBe('obj_find_dispatch');

      expectAccepted(collect(session, 'ward_dispatch'));
      view = deriveWorldView(session.getState(), STAGE5_CONTENT);
      expect(view.currentObjective?.objectiveId).toBe('obj_hear_ivo');

      expectAccepted(collect(session, 'vendor_testimony'));
      view = deriveWorldView(session.getState(), STAGE5_CONTENT);
      expect(view.currentObjective?.objectiveId).toBe('obj_decide_vendor');

      expectAccepted(choose(session, 'node.vendor.silence', 'protect'));
      view = deriveWorldView(session.getState(), STAGE5_CONTENT);
      expect(view.currentObjective?.objectiveId).toBe('obj_make_call');

      expectAccepted(choose(session, 'node.ward.call', 'file'));
      view = deriveWorldView(session.getState(), STAGE5_CONTENT);
      expect(view.currentObjective).toBeNull();
      expect(view.ending?.endingId).toBe('ending.open_record');
    });
  });

  describe('Branch Isolation & Timeline Regression', () => {
    it('maintains strict branch isolation across BLINK switches', async () => {
      const { session } = await testHarness();
      const v1Id = session.getActiveBranchId();

      expectAccepted(collect(session, 'relay_7_log'));
      expectAccepted(choose(session, 'node.sable.relay', 'share'));
      expectAccepted(collect(session, 'ward_dispatch'));
      expectAccepted(collect(session, 'vendor_testimony'));
      expectAccepted(choose(session, 'node.vendor.silence', 'protect'));

      // Record anchor
      expectAccepted(session.recordAnchor('Decision Checkpoint'));
      const anchor = session.getState().anchors[0]!;

      // Fork V2
      const fork = session.forkTimeline(anchor.anchorId, 'Timeline V2');
      const v2Id = fork.branchId!;
      expect(session.getActiveBranchId()).toBe(v1Id);

      // In V1, make call -> file
      expectAccepted(choose(session, 'node.ward.call', 'file'));
      const v1State = session.getState();
      expect(v1State.endingId).toBe('ending.open_record');

      // Switch to V2
      session.switchBranch(v2Id);
      const v2State = session.getState();
      expect(v2State.endingId).toBeNull();
      expect(v2State.facts['story.ward_call']).toBeUndefined();

      // In V2, make alternate call -> bury
      expectAccepted(choose(session, 'node.ward.call', 'bury'));
      const v2AfterState = session.getState();
      expect(v2AfterState.endingId).toBe('ending.sealed_street');

      // Switch back to V1
      session.switchBranch(v1Id);
      const v1Restored = session.getState();
      expect(v1Restored.endingId).toBe('ending.open_record');
      expect(v1Restored.facts['story.ward_call']?.value).toBe('file');
    });
  });
});
