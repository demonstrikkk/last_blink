import {
  CONTRACT_VERSION,
  DeterministicGameSession,
  InMemoryPersistence,
  StaticContentPort,
  allowAllPolicy,
  createConsoleLogger,
  createSystemClock,
  type PlayerProfile,
  type SessionId,
} from '../engine/index.js';

/**
 * Browser composition root for Stage 3. Only this file chooses concrete ports;
 * the engine never imports it. Persistence is in-memory for now; IndexedDB and
 * the YSQL adapter arrive after the event contracts are proven in play.
 */
export async function createBrowserSession(): Promise<DeterministicGameSession> {
  const clock = createSystemClock();
  const sessionId = (`ses_local_${Date.now().toString(36)}` as SessionId);

  const player: PlayerProfile = {
    schemaVersion: CONTRACT_VERSION,
    playerId: 'ply_local' as PlayerProfile['playerId'],
    displayName: 'Field Auditor',
    createdAt: clock.nowIso(),
    consent: { telemetry: false, npcMemory: false },
    behaviouralSignals: { explorationStyle: 'unknown', decisionLatencyBand: 'unknown' },
    progress: { choicesMade: 0, evidenceFound: 0, anchorsReached: 0 },
  };

  return DeterministicGameSession.create(
    { sessionId, player, seed: `local-${sessionId}` },
    {
      clock,
      policy: allowAllPolicy,
      persistence: new InMemoryPersistence(),
      content: new StaticContentPort(),
      logger: createConsoleLogger(),
    },
  );
}
