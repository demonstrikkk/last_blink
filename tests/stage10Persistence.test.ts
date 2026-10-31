import { describe, expect, it } from 'vitest';
import {
  DeterministicGameSession,
  FixedClock,
  InMemoryLogger,
  StaticContentPort,
  allowAllPolicy,
  canonicalJson,
  type GameSessionDeps,
  type PlayerProfile,
  type SessionId,
} from '../src/engine/index.js';
import {
  IndexedDbPersistence,
  createMemoryIdbFactory,
} from '../src/session/indexedDb.js';
import {
  CorruptSaveError,
  PersistenceUnavailableError,
} from '../src/engine/session/persistenceErrors.js';
import { createBrowserSession } from '../src/session/runtime.js';
import { STAGE5_CONTENT } from '../src/content/stage5Content.js';

function createTestPersistence(dbName = `test_db_${Math.random().toString(36).slice(2)}`): IndexedDbPersistence {
  const factory = createMemoryIdbFactory();
  return new IndexedDbPersistence({ dbName, factory });
}

async function createTestHarness(persistence?: IndexedDbPersistence, seed = 'stage10-seed') {
  const clock = new FixedClock('2026-02-01T12:00:00.000Z');
  const logger = new InMemoryLogger();
  const content = new StaticContentPort(STAGE5_CONTENT);
  const p = persistence ?? createTestPersistence();
  const deps: GameSessionDeps = {
    clock,
    policy: allowAllPolicy,
    persistence: p,
    content,
    logger,
  };

  const sessionId = (`ses_test_${Math.random().toString(36).slice(2)}` as SessionId);
  const player: PlayerProfile = {
    schemaVersion: '1.0.0',
    playerId: 'ply_test_pers' as PlayerProfile['playerId'],
    displayName: 'Test Auditor',
    createdAt: clock.nowIso(),
    consent: { telemetry: false, npcMemory: false },
    behaviouralSignals: { explorationStyle: 'thorough', decisionLatencyBand: 'fast' },
    progress: { choicesMade: 0, evidenceFound: 0, anchorsReached: 0 },
  };

  const session = await DeterministicGameSession.create(
    { sessionId, player, seed },
    deps,
  );

  return { session, deps, persistence: p, clock, content, logger, sessionId };
}

describe('Stage 10: Durable Persistence (IndexedDB)', () => {
  it('1. performs save and restore round-trip with full state and hash parity', async () => {
    const { session, deps, persistence } = await createTestHarness();

    session.advanceTick(2);
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    session.recordAnchor('Anchor 1');

    const envelope = await session.save();
    expect(envelope.sessionId).toBe(session.sessionId);
    expect(envelope.engineStateHash).toBe(session.getSnapshot().hash);

    const loaded = await persistence.load(session.sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.checksum).toBe(envelope.checksum);

    const restored = await DeterministicGameSession.restore(loaded!, deps);
    expect(canonicalJson(restored.getState())).toBe(canonicalJson(session.getState()));
    expect(restored.getSnapshot().hash).toBe(session.getSnapshot().hash);
    expect(restored.getRecentEvents().length).toBeGreaterThan(0);
  });

  it('2. recovers seamlessly across simulated browser reload', async () => {
    const persistence = createTestPersistence('reload_test_db');
    const { session } = await createTestHarness(persistence);

    session.advanceTick(1);
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    session.recordAnchor('Reload checkpoint');
    await session.save();

    const expectedState = session.getState();
    const expectedHash = session.getSnapshot().hash;

    // Simulate page reload by calling createBrowserSession with the same persistence adapter
    const reloadResult = await createBrowserSession({ persistence });
    expect(reloadResult.restoredFromSave).toBe(true);
    expect(canonicalJson(reloadResult.session.getState())).toBe(canonicalJson(expectedState));
    expect(reloadResult.session.getSnapshot().hash).toBe(expectedHash);
  });

  it('3. preserves multiple branches across save and restore', async () => {
    const { session, deps, persistence } = await createTestHarness();

    session.advanceTick(1);
    session.recordAnchor('Fork base');
    const anchor = session.getState().anchors[0]!;

    const fork = session.forkTimeline(anchor.anchorId, 'Timeline V2');
    expect(fork.result.status).toBe('accepted');
    const v2Id = fork.branchId!;

    // Switch to V2 and collect evidence
    const switched = session.switchBranch(v2Id);
    expect(switched.status).toBe('switched');
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });

    await session.save();

    const loaded = await persistence.load(session.sessionId);
    const restored = await DeterministicGameSession.restore(loaded!, deps);

    const branches = restored.listBranches();
    expect(branches).toHaveLength(2);
    expect(branches.map((b) => b.label)).toContain('Original timeline');
    expect(branches.map((b) => b.label)).toContain('Timeline V2');
  });

  it('4. restores active branch correctly and allows switching to V1 post-restore', async () => {
    const { session, deps, persistence } = await createTestHarness();

    session.advanceTick(1);
    session.recordAnchor('Fork base');
    const anchor = session.getState().anchors[0]!;
    const v1Id = session.getActiveBranchId();

    const fork = session.forkTimeline(anchor.anchorId, 'Timeline V2');
    const v2Id = fork.branchId!;
    const v1HashAfterFork = session.getSnapshot().hash;
    session.switchBranch(v2Id);

    // V2 makes progress
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    const v2Hash = session.getSnapshot().hash;

    await session.save();

    const loaded = await persistence.load(session.sessionId);
    const restored = await DeterministicGameSession.restore(loaded!, deps);

    // Active branch at restore must be V2
    expect(restored.getActiveBranchId()).toBe(v2Id);
    expect(restored.getSnapshot().hash).toBe(v2Hash);

    // Switch back to V1
    const switchBack = restored.switchBranch(v1Id);
    expect(switchBack.status).toBe('switched');
    expect(restored.getActiveBranchId()).toBe(v1Id);
    expect(restored.getSnapshot().hash).toBe(v1HashAfterFork);
    // V1 state does NOT have the post-fork V2 evidence
    expect(restored.getState().facts['evidence.relay_7']).toBeUndefined();
  });

  it('5. preserves checkpoint coordinates and ancestry after reload', async () => {
    const { session, deps, persistence } = await createTestHarness();

    session.advanceTick(2);
    session.recordAnchor('Checkpoint Alpha');
    const anchor = session.getState().anchors[0]!;

    const fork = session.forkTimeline(anchor.anchorId, 'Branch Beta');
    await session.save();

    const loaded = await persistence.load(session.sessionId);
    const restored = await DeterministicGameSession.restore(loaded!, deps);

    const childBranch = restored.getState().branches.find((b) => b.branchId === fork.branchId);
    expect(childBranch).toBeDefined();
    expect(childBranch?.forkedAtAnchorId).toBe(anchor.anchorId);
    expect(childBranch?.forkedAtStateVersion).toBe(anchor.stateVersion);
    expect(childBranch?.forkedAtStateHash).toBe(anchor.stateHash);
  });

  it('6. preserves deterministic event ordering across restore', async () => {
    const { session, deps, persistence } = await createTestHarness();

    session.advanceTick(1);
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    session.recordAnchor('Event order check');

    const eventsBefore = session.getLineageEvents().map((e) => ({
      seq: e.sequenceNo,
      type: e.type,
      eventId: e.eventId,
    }));

    await session.save();

    const loaded = await persistence.load(session.sessionId);
    const restored = await DeterministicGameSession.restore(loaded!, deps);
    const eventsAfter = restored.getLineageEvents().map((e) => ({
      seq: e.sequenceNo,
      type: e.type,
      eventId: e.eventId,
    }));

    expect(eventsAfter).toEqual(eventsBefore);
  });

  it('7. verifies snapshot integrity and rejects mismatched hash or tampered payload', async () => {
    const { session, persistence } = await createTestHarness();
    session.advanceTick(1);
    const envelope = await session.save();

    // Tampered payload
    const tampered = {
      ...envelope,
      payload: {
        ...envelope.payload,
        tick: 999,
      },
    };

    await expect(persistence.save(tampered)).rejects.toThrow(CorruptSaveError);
  });

  it('8. handles idempotent duplicate saves cleanly without corruption', async () => {
    const { session, persistence } = await createTestHarness();
    session.advanceTick(1);

    const save1 = await session.save();
    const save2 = await session.save();

    expect(save1.payload.stateVersion).toBe(save2.payload.stateVersion);
    const list = await persistence.list();
    // Only one record per sessionId in meta
    expect(list.filter((s) => s.sessionId === session.sessionId)).toHaveLength(1);
  });

  it('9. transaction abort rolls back without corrupting existing save', async () => {
    const factory = createMemoryIdbFactory();
    const persistence = new IndexedDbPersistence({ dbName: 'tx_fail_db', factory });
    const { session } = await createTestHarness(persistence);

    session.advanceTick(1);
    await session.save();
    const savedBefore = await persistence.load(session.sessionId);
    expect(savedBefore).not.toBeNull();

    // Open a raw transaction and abort it
    const dbReq = factory.open('tx_fail_db', 1);
    await new Promise<void>((resolve) => {
      dbReq.onsuccess = (ev: any) => {
        const db = ev.target.result;
        const tx = db.transaction(['envelopes', 'session_meta'], 'readwrite');
        const store = tx.objectStore('envelopes');
        store.delete(session.sessionId);
        tx.abort();
        tx.onabort = () => resolve();
      };
    });

    // The original save must still exist completely intact!
    const savedAfter = await persistence.load(session.sessionId);
    expect(savedAfter?.checksum).toBe(savedBefore?.checksum);
  });

  it('10. detects corrupted JSON or envelope schema violations', async () => {
    const factory = createMemoryIdbFactory();
    const persistence = new IndexedDbPersistence({ dbName: 'corrupt_db', factory });
    const { session } = await createTestHarness(persistence);

    session.advanceTick(1);
    await session.save();

    // Overwrite envelope with invalid schema
    const dbReq = factory.open('corrupt_db', 1);
    await new Promise<void>((resolve) => {
      dbReq.onsuccess = (ev: any) => {
        const db = ev.target.result;
        const tx = db.transaction(['envelopes'], 'readwrite');
        const store = tx.objectStore('envelopes');
        store.put({ sessionId: session.sessionId, garbageField: true });
        tx.oncomplete = () => resolve();
      };
    });

    await expect(persistence.load(session.sessionId)).rejects.toThrow(CorruptSaveError);
  });

  it('11. rejects invalid or outdated save format version', async () => {
    const { session, persistence } = await createTestHarness();
    session.advanceTick(1);
    const envelope = await session.save();

    const invalidVersion = {
      ...envelope,
      saveFormatVersion: 99,
    };

    await expect(persistence.save(invalidVersion as any)).rejects.toThrow();
  });

  it('12. throws PersistenceUnavailableError when no IndexedDB factory is available', () => {
    expect(() => {
      new IndexedDbPersistence({ factory: undefined });
    }).toThrow(PersistenceUnavailableError);
  });
});
