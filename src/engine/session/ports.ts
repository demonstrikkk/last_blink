import type { GameContent } from '../content/stage3Content.js';
import type { GameState, SaveEnvelope, SessionId } from '../contracts/index.js';
import type { ParsedAction } from '../core/actions.js';

/** Time is injected so deterministic tests never read the wall clock. */
export interface ClockPort {
  nowIso(): string;
}

export interface PolicyRequest {
  readonly action: ParsedAction;
  readonly state: GameState;
}

export interface PolicyVerdict {
  readonly allowed: boolean;
  readonly code?: string;
  readonly message?: string;
}

/**
 * MORROW and NPC policies implement this port later. A policy may only allow or
 * deny; it never receives write access to state.
 */
export interface GamePolicyPort {
  evaluate(request: PolicyRequest): PolicyVerdict;
}

export interface SaveSummary {
  readonly sessionId: SessionId;
  readonly saveId: string;
  readonly savedAt: string;
  readonly stateVersion: number;
}

/** Local memory now; IndexedDB and YSQL adapters implement this later. */
export interface PersistencePort {
  save(envelope: SaveEnvelope): Promise<void>;
  load(sessionId: SessionId): Promise<SaveEnvelope | null>;
  list(): Promise<SaveSummary[]>;
}

export interface ContentPort {
  load(): Promise<GameContent>;
}

export interface LoggerPort {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}
