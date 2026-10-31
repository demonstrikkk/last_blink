import { STAGE3_CONTENT, gameContentSchema, type GameContent } from '../content/stage3Content.js';
import { saveEnvelopeSchema, type SaveEnvelope, type SessionId } from '../contracts/index.js';
import type {
  ClockPort,
  ContentPort,
  GamePolicyPort,
  LoggerPort,
  PersistencePort,
  PolicyRequest,
  PolicyVerdict,
  SaveSummary,
} from './ports.js';

/** Deterministic clock: fixed start plus a fixed step per call. */
export class FixedClock implements ClockPort {
  private current: number;
  private readonly stepMs: number;

  constructor(initialIso = '2026-01-01T00:00:00.000Z', stepMs = 1000) {
    this.current = Date.parse(initialIso);
    if (Number.isNaN(this.current)) throw new Error('FixedClock: invalid initial timestamp');
    this.stepMs = stepMs;
  }

  nowIso(): string {
    const iso = new Date(this.current).toISOString();
    this.current += this.stepMs;
    return iso;
  }
}

export function createSystemClock(): ClockPort {
  return { nowIso: () => new Date().toISOString() };
}

export class InMemoryPersistence implements PersistencePort {
  private readonly saves = new Map<SessionId, SaveEnvelope>();

  async save(envelope: SaveEnvelope): Promise<void> {
    const parsed = saveEnvelopeSchema.parse(envelope);
    this.saves.set(parsed.sessionId, structuredClone(parsed));
  }

  async load(sessionId: SessionId): Promise<SaveEnvelope | null> {
    const stored = this.saves.get(sessionId);
    return stored ? structuredClone(stored) : null;
  }

  async list(): Promise<SaveSummary[]> {
    return [...this.saves.values()]
      .map((save) => ({
        sessionId: save.sessionId,
        saveId: save.saveId,
        savedAt: save.savedAt,
        stateVersion: save.payload.stateVersion,
      }))
      .sort((left, right) => (left.savedAt < right.savedAt ? -1 : 1));
  }
}

export class StaticContentPort implements ContentPort {
  constructor(private readonly content: GameContent = STAGE3_CONTENT) {}

  async load(): Promise<GameContent> {
    return gameContentSchema.parse(structuredClone(this.content));
  }
}

/** Permits every validated action; used by the UI shell and happy-path tests. */
export const allowAllPolicy: GamePolicyPort = {
  evaluate: (): PolicyVerdict => ({ allowed: true }),
};

/** Denies written facts under given prefixes. Stands in for MORROW later. */
export function createPrefixPolicy(deniedPrefixes: readonly string[]): GamePolicyPort {
  return {
    evaluate(request: PolicyRequest): PolicyVerdict {
      const action = request.action;
      if (action.actionType !== 'fact.assert') return { allowed: true };
      const key = action.params.key;
      const denied = deniedPrefixes.find((prefix) => key.startsWith(prefix));
      return denied
        ? {
            allowed: false,
            code: 'policy_denied',
            message: `policy denies facts under ${denied}`,
          }
        : { allowed: true };
    },
  };
}

export interface LogEntry {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly fields: Record<string, unknown>;
}

export class InMemoryLogger implements LoggerPort {
  readonly entries: LogEntry[] = [];

  debug(message: string, fields: Record<string, unknown> = {}): void {
    this.entries.push({ level: 'debug', message, fields });
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.entries.push({ level: 'info', message, fields });
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    this.entries.push({ level: 'warn', message, fields });
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    this.entries.push({ level: 'error', message, fields });
  }
}

export function createConsoleLogger(prefix = '[last-blink]'): LoggerPort {
  return {
    debug: (message, fields = {}) => console.debug(`${prefix} ${message}`, fields),
    info: (message, fields = {}) => console.info(`${prefix} ${message}`, fields),
    warn: (message, fields = {}) => console.warn(`${prefix} ${message}`, fields),
    error: (message, fields = {}) => console.error(`${prefix} ${message}`, fields),
  };
}
