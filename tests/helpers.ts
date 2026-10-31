import {
  CONTRACT_VERSION,
  DeterministicGameSession,
  FixedClock,
  InMemoryLogger,
  InMemoryPersistence,
  StaticContentPort,
  allowAllPolicy,
  type ClockPort,
  type GamePolicyPort,
  type LoggerPort,
  type PersistencePort,
  type PlayerProfile,
  type SessionId,
  type ContentPort,
} from '../src/engine/index.js';

let sessionCounter = 0;

export interface SessionHarness {
  readonly session: DeterministicGameSession;
  readonly clock: ClockPort;
  readonly policy: GamePolicyPort;
  readonly persistence: PersistencePort;
  readonly logger: LoggerPort;
  readonly content: ContentPort;
}

export interface HarnessOptions {
  readonly clock?: ClockPort;
  readonly policy?: GamePolicyPort;
  readonly persistence?: PersistencePort;
  readonly logger?: LoggerPort;
  readonly content?: ContentPort;
  readonly sessionId?: string;
  readonly seed?: string;
}

export function makePlayer(createdAt = '2026-01-01T00:00:00.000Z'): PlayerProfile {
  return {
    schemaVersion: CONTRACT_VERSION,
    playerId: 'ply_testplayer' as PlayerProfile['playerId'],
    displayName: 'Test Auditor',
    createdAt,
    consent: { telemetry: false, npcMemory: true },
    behaviouralSignals: { explorationStyle: 'thorough', decisionLatencyBand: 'measured' },
    progress: { choicesMade: 0, evidenceFound: 0, anchorsReached: 0 },
  };
}

export async function createHarness(options: HarnessOptions = {}): Promise<SessionHarness> {
  sessionCounter += 1;
  const clock = options.clock ?? new FixedClock();
  const policy = options.policy ?? allowAllPolicy;
  const persistence = options.persistence ?? new InMemoryPersistence();
  const logger = options.logger ?? new InMemoryLogger();
  const content = options.content ?? new StaticContentPort();
  const sessionId = options.sessionId ?? `ses_test${sessionCounter}`;

  const session = await DeterministicGameSession.create(
    {
      sessionId: sessionId as SessionId,
      player: makePlayer(),
      seed: options.seed ?? 'stage3-test-seed',
    },
    { clock, policy, persistence, content, logger },
  );

  return { session, clock, policy, persistence, logger, content };
}
