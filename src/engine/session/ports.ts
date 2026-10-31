import type { GameContent } from '../content/stage3Content.js';
import type { BranchId, GameEvent, GameState, SaveEnvelope, SessionId } from '../contracts/index.js';
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

export interface BranchSnapshotRecord {
  readonly sessionId: SessionId;
  readonly branchId: BranchId;
  readonly stateVersion: number;
  readonly stateHash: string;
  readonly state: GameState;
  readonly updatedAt: string;
}

export interface SessionDurableRecord {
  readonly envelope: SaveEnvelope;
  readonly events: readonly GameEvent[];
  readonly branchSnapshots: readonly BranchSnapshotRecord[];
  readonly activeBranchId: BranchId;
}

/** Local memory now; IndexedDB and YSQL adapters implement this later. */
export interface PersistencePort {
  save(envelope: SaveEnvelope): Promise<void>;
  load(sessionId: SessionId): Promise<SaveEnvelope | null>;
  list(): Promise<SaveSummary[]>;

  // Optional extensions for multi-branch and event-durable persistence
  saveSession?(record: SessionDurableRecord): Promise<void>;
  loadSession?(sessionId: SessionId): Promise<SessionDurableRecord | null>;
  delete?(sessionId: SessionId): Promise<void>;
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
