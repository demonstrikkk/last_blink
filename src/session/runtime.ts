import {
  CONTRACT_VERSION,
  DeterministicGameSession,
  InMemoryPersistence,
  StaticContentPort,
  allowAllPolicy,
  createConsoleLogger,
  createSystemClock,
  type PersistencePort,
  type PlayerProfile,
  type SessionId,
} from '../engine/index.js';
import { IndexedDbPersistence } from './indexedDb.js';
import { STAGE5_CONTENT } from '../content/stage5Content.js';

export interface BrowserSessionOptions {
  readonly forceNew?: boolean;
  readonly persistence?: PersistencePort;
}

export interface BrowserSessionResult {
  readonly session: DeterministicGameSession;
  readonly persistence: PersistencePort;
  readonly restoredFromSave: boolean;
}

function resolvePersistence(): PersistencePort {
  try {
    if (typeof indexedDB !== 'undefined') {
      return new IndexedDbPersistence();
    }
  } catch (err) {
    console.warn('[last-blink] IndexedDB unavailable, falling back to InMemoryPersistence', err);
  }
  return new InMemoryPersistence();
}

/**
 * Browser composition root. Selects durable IndexedDB persistence when available
 * and automatically attempts refresh recovery of the latest saved session.
 */
export async function createBrowserSession(options: BrowserSessionOptions = {}): Promise<BrowserSessionResult> {
  const clock = createSystemClock();
  const logger = createConsoleLogger();
  const content = new StaticContentPort(STAGE5_CONTENT);
  const persistence = options.persistence ?? resolvePersistence();

  const deps = {
    clock,
    policy: allowAllPolicy,
    persistence,
    content,
    logger,
  };

  // Attempt refresh recovery from latest save unless forceNew requested
  if (!options.forceNew) {
    try {
      const saves = await persistence.list();
      if (saves.length > 0) {
        const latestSummary = saves[0]!;
        const envelope = await persistence.load(latestSummary.sessionId);
        if (envelope) {
          const restored = await DeterministicGameSession.restore(envelope, deps);
          logger.info('restored session from durable persistence', {
            sessionId: latestSummary.sessionId,
            saveId: latestSummary.saveId,
            stateVersion: latestSummary.stateVersion,
          });
          return { session: restored, persistence, restoredFromSave: true };
        }
      }
    } catch (err) {
      logger.warn('Failed to restore session from persistence, initializing fresh session', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Create brand new session
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

  const session = await DeterministicGameSession.create(
    { sessionId, player, seed: `local-${sessionId}` },
    deps,
  );

  return { session, persistence, restoredFromSave: false };
}
