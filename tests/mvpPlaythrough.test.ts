import { describe, expect, it } from 'vitest';
import {
  EchoService,
  MorrowController,
  NpcCognitionController,
  createSystemClock,
  type GameEventId,
  type NpcId,
} from '../src/engine/index.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';
import { createMemoryIdbFactory, IndexedDbPersistence } from '../src/session/indexedDb.js';
import { createBrowserSession } from '../src/session/runtime.js';

describe('Relay Street Playable MVP End-to-End Golden Path', () => {
  it('executes the full investigative arc: evidence -> decisions -> BLINK -> ECHO -> endings -> save -> reload', async () => {
    const factory = createMemoryIdbFactory();
    const persistence = new IndexedDbPersistence({
      dbName: 'mvp_playthrough_db',
      factory,
    });

    // 1. START GAME: New browser session
    const { session, restoredFromSave } = await createBrowserSession({
      forceNew: true,
      persistence,
    });
    expect(restoredFromSave).toBe(false);

    const v1Id = session.getActiveBranchId();
    expect(v1Id).toMatch(/^brn_/);

    const initialState = session.getState();
    expect(initialState.tick).toBe(0);
    expect(initialState.facts['story.phase']?.value).toBe('arrival');
    expect(initialState.facts['world.curfew']?.value).toBe('active');
    expect(initialState.player.progress.evidenceFound).toBe(0);

    // Initialise MORROW and NPC controllers (as App.tsx does)
    const clock = createSystemClock();
    const morrow = new MorrowController(session, { clock });
    const npc = new NpcCognitionController(session, { clock });

    // 2. DISCOVER & INSPECT RELAY 7
    const collectRelay = session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    expect(collectRelay.status).toBe('accepted');

    const relayFact = session.getState().facts['evidence.relay_7'];
    expect(relayFact).toBeDefined();
    expect(relayFact?.source.kind).toBe('record');
    expect(relayFact?.confidence).toBe(0.9);
    expect(session.getState().facts['story.phase']?.value).toBe('investigation');

    // Trigger MORROW and NPCs on evidence collection
    const relayEventId = collectRelay.eventIds[collectRelay.eventIds.length - 1] as GameEventId;
    const morrowTurn1 = morrow.run({ triggerEventId: relayEventId });
    expect(morrowTurn1).toBeDefined();
    expect(morrowTurn1?.result.status).toBe('accepted');

    const sableTurn1 = npc.run('npc_sable' as NpcId);
    expect(sableTurn1?.result?.status).toBe('accepted');

    // 3. SABLE INTERACTION & SHARE/CONCEAL DECISION
    const shareChoice = session.dispatch({
      actionType: 'choice.make',
      actorId: 'player_local',
      params: { nodeId: 'node.sable.relay', optionId: 'share' },
    });
    expect(shareChoice.status).toBe('accepted');

    const stateAfterSable = session.getState();
    expect(stateAfterSable.facts['story.relay_choice']?.value).toBe('share');
    expect(stateAfterSable.facts['world.ward_alert']?.value).toBe('raised');
    expect(stateAfterSable.facts['npc.sable.stance']?.value).toBe('relieved');
    expect(stateAfterSable.facts['npc.sable.trust']?.value).toBe('trusted');
    expect(stateAfterSable.facts['story.phase']?.value).toBe('decision');

    const sableChoiceEventId = shareChoice.eventIds[shareChoice.eventIds.length - 1] as GameEventId;
    morrow.run({ triggerEventId: sableChoiceEventId });
    npc.run('npc_sable' as NpcId);

    // 4. DISCOVER DISPATCH RECORD & EXPERIENCE DELAYED CONSEQUENCE
    const collectDispatch = session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'ward_dispatch' },
    });
    expect(collectDispatch.status).toBe('accepted');

    const stateAfterDispatch = session.getState();
    expect(stateAfterDispatch.facts['evidence.ward_dispatch']).toBeDefined();
    // Delayed rule rul_dispatch_unbroken fires because relay_choice was 'share'
    expect(stateAfterDispatch.facts['world.dispatch_continuity']?.value).toBe('unbroken');

    // 5. MEET IVO & MAKE PROTECT/EXPOSE DECISION
    const collectTestimony = session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'vendor_testimony' },
    });
    expect(collectTestimony.status).toBe('accepted');
    expect(session.getState().facts['evidence.vendor_testimony']?.source.kind).toBe('testimony');

    const protectChoice = session.dispatch({
      actionType: 'choice.make',
      actorId: 'player_local',
      params: { nodeId: 'node.vendor.silence', optionId: 'protect' },
    });
    expect(protectChoice.status).toBe('accepted');

    const stateAfterIvo = session.getState();
    expect(stateAfterIvo.facts['npc.ivo.stance']?.value).toBe('protected');
    expect(stateAfterIvo.facts['world.vendor_confidence']?.value).toBe('high');
    expect(stateAfterIvo.facts['world.morrow_scrutiny']?.value).toBe('elevated');
    expect(stateAfterIvo.facts['story.phase']?.value).toBe('accounting');

    // 6. RECORD ANCHOR CHECKPOINT AT LAMP POST
    const anchorResult = session.recordAnchor('Cyan lamp post');
    expect(anchorResult.status).toBe('accepted');
    const anchor = session.getState().anchors[0]!;
    expect(anchor.label).toBe('Cyan lamp post');
    expect(anchor.safe).toBe(true);

    // 7. BLINK: FORK ALTERNATE TIMELINE V2
    const fork = session.forkTimeline(anchor.anchorId, 'Timeline V2 (Bury Account)');
    expect(fork.result.status).toBe('accepted');
    expect(fork.branchId).not.toBeNull();
    const v2Id = fork.branchId!;

    // V1 remains active straight after fork
    expect(session.getActiveBranchId()).toBe(v1Id);
    expect(session.listBranches()).toHaveLength(2);
    const v1HashAfterFork = session.getSnapshot().hash;

    // 8. SWITCH TO V2 & REACH FIRST ALTERNATE ENDING (QUIET STREET)
    const switchToV2 = session.switchBranch(v2Id);
    expect(switchToV2.status).toBe('switched');
    expect(session.getActiveBranchId()).toBe(v2Id);

    // In V2, make alternate ward call: bury the account
    const buryCall = session.dispatch({
      actionType: 'choice.make',
      actorId: 'player_local',
      params: { nodeId: 'node.ward.call', optionId: 'bury' },
    });
    expect(buryCall.status).toBe('accepted');

    const v2State = session.getState();
    expect(v2State.endingId).toBe('ending.sealed_street');
    expect(v2State.facts['story.ending_id']?.value).toBe('ending.sealed_street');
    const v2FinalHash = session.getSnapshot().hash;

    // 9. SWITCH BACK TO V1 & REACH PRIMARY ENDING (THE OPEN RECORD)
    const switchBackToV1 = session.switchBranch(v1Id);
    expect(switchBackToV1.status).toBe('switched');
    expect(session.getActiveBranchId()).toBe(v1Id);
    expect(session.getSnapshot().hash).toBe(v1HashAfterFork);

    // In V1, the ward call has not been made yet!
    expect(session.getState().endingId).toBeNull();
    expect(session.getState().facts['story.ward_call']).toBeUndefined();

    // File the account in V1
    const fileCall = session.dispatch({
      actionType: 'choice.make',
      actorId: 'player_local',
      params: { nodeId: 'node.ward.call', optionId: 'file' },
    });
    expect(fileCall.status).toBe('accepted');

    const v1FinalState = session.getState();
    expect(v1FinalState.endingId).toBe('ending.open_record');
    expect(v1FinalState.facts['story.ending_id']?.value).toBe('ending.open_record');
    const v1FinalHash = session.getSnapshot().hash;

    // 10. ECHO: COMPARE TIMELINES WITH GROUNDED CITATIONS
    const echo = new EchoService(session, STAGE5_CONTENT);
    const comparison = session.compareBranches(v1Id, v2Id);
    expect(comparison.base.branchId).toBe(v1Id);
    expect(comparison.other.branchId).toBe(v2Id);
    expect(comparison.endings.base).toBe('ending.open_record');
    expect(comparison.endings.other).toBe('ending.sealed_street');

    const wardCallDiff = comparison.choices.find((c) => c.nodeId === 'node.ward.call');
    expect(wardCallDiff).toBeDefined();
    expect(wardCallDiff?.divergent).toBe(true);
    expect(wardCallDiff?.baseOptionId).toBe('file');
    expect(wardCallDiff?.otherOptionId).toBe('bury');

    // Query ECHO for the ending on V1 and V2
    const echoV1Ending = echo.ask({ kind: 'ending', branchId: v1Id });
    expect(echoV1Ending.status).toBe('grounded');
    expect(echoV1Ending.summary).toContain('The Open Record');
    expect(echoV1Ending.claims.length).toBeGreaterThan(0);

    const echoV2Ending = echo.ask({ kind: 'ending', branchId: v2Id });
    expect(echoV2Ending.status).toBe('grounded');
    expect(echoV2Ending.summary).toContain('The Quiet Street');

    // 11. PERSISTENCE & RELOAD RECOVERY
    const savedEnvelope = await session.save();
    expect(savedEnvelope.sessionId).toBe(session.sessionId);
    expect(savedEnvelope.engineStateHash).toBe(v1FinalHash);

    // Simulate browser reload
    const reloaded = await createBrowserSession({ persistence });
    expect(reloaded.restoredFromSave).toBe(true);
    expect(reloaded.session.sessionId).toBe(session.sessionId);

    // Active branch in reloaded session is V1
    expect(reloaded.session.getActiveBranchId()).toBe(v1Id);
    expect(reloaded.session.getSnapshot().hash).toBe(v1FinalHash);
    expect(reloaded.session.getState().endingId).toBe('ending.open_record');

    // Switch to V2 in reloaded session
    const reloadedSwitchV2 = reloaded.session.switchBranch(v2Id);
    expect(reloadedSwitchV2.status).toBe('switched');
    expect(reloaded.session.getActiveBranchId()).toBe(v2Id);
    expect(reloaded.session.getSnapshot().hash).toBe(v2FinalHash);
    expect(reloaded.session.getState().endingId).toBe('ending.sealed_street');

    // Lineage events are preserved in both branches
    expect(reloaded.session.getLineageEvents(v1Id).length).toBeGreaterThan(10);
    expect(reloaded.session.getLineageEvents(v2Id).length).toBeGreaterThan(10);
  });
});
