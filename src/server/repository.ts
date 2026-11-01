/**
 * Persistence contract for the canonical event/snapshot store. Both the
 * YugabyteDB adapter and the in-memory adapter used by tests implement this
 * interface, so route behaviour is verified against the same semantics that
 * production uses.
 *
 * The repository never owns game rules. It stores validated, already-computed
 * events and snapshots, and enforces ownership, idempotency and optimistic
 * concurrency at the storage boundary.
 */

export interface StoredSession {
  readonly sessionId: string;
  readonly playerId: string;
  readonly scenarioId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StoredBranch {
  readonly sessionId: string;
  readonly branchId: string;
  readonly parentBranchId: string | null;
  readonly forkEventId: string | null;
  readonly branchName: string;
  readonly createdAt: string;
  readonly headVersion: number;
}

export interface StoredEvent {
  readonly sessionId: string;
  readonly eventId: string;
  readonly branchId: string;
  readonly sequenceNo: number;
  readonly stateVersion: number;
  readonly eventType: string;
  readonly eventJson: unknown;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface StoredSnapshot {
  readonly sessionId: string;
  readonly branchId: string;
  readonly stateVersion: number;
  readonly stateHash: string;
  readonly snapshotJson: unknown;
  readonly createdAt: string;
}

export interface MekoOutboxRecord {
  readonly sessionId: string;
  readonly eventId: string;
  readonly npcId: string;
  readonly branchId: string;
  readonly visibilityScope: string;
  readonly content: string;
  readonly confidence: number;
}

export interface CreateSessionInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly scenarioId: string;
  readonly branchId?: string;
  readonly branchName?: string;
}

export interface CreateBranchInput {
  readonly sessionId: string;
  readonly branchId: string;
  readonly parentBranchId: string | null;
  readonly forkEventId: string | null;
  readonly branchName: string;
}

export interface CommitEventInput {
  readonly event: Omit<StoredEvent, 'createdAt'>;
  /**
   * Snapshots are optional per event. The head version is tracked on the branch,
   * so a client can upload a run of events and attach one final state snapshot.
   */
  readonly snapshot: Omit<StoredSnapshot, 'createdAt'> | null;
  /** Version the client believes is current. Must equal the stored head. */
  readonly expectedVersion: number;
}

export type CommitResult =
  | {
      readonly status: 'committed';
      readonly event: StoredEvent;
      readonly snapshot: StoredSnapshot | null;
    }
  | { readonly status: 'duplicate'; readonly event: StoredEvent }
  | { readonly status: 'conflict'; readonly currentVersion: number };

export interface GameRepository {
  health(): Promise<boolean>;
  createSession(input: CreateSessionInput): Promise<StoredSession>;
  getSession(sessionId: string): Promise<StoredSession | null>;
  listSessions(playerId: string): Promise<readonly StoredSession[]>;
  getBranch(sessionId: string, branchId: string): Promise<StoredBranch | null>;
  listBranches(sessionId: string): Promise<readonly StoredBranch[]>;
  createBranch(input: CreateBranchInput): Promise<StoredBranch>;
  listEvents(sessionId: string, branchId: string): Promise<readonly StoredEvent[]>;
  latestSnapshot(sessionId: string, branchId: string): Promise<StoredSnapshot | null>;
  getSnapshot(sessionId: string, branchId: string, stateVersion: number): Promise<StoredSnapshot | null>;
  commitEvent(input: CommitEventInput): Promise<CommitResult>;
  enqueueMekoMemory?(record: MekoOutboxRecord): Promise<void>;
  listPendingMekoMemories?(limit?: number): Promise<readonly MekoOutboxRecord[]>;
  markMekoMemoryDelivered?(sessionId: string, eventId: string): Promise<void>;
  close(): Promise<void>;
}

export class RepositoryUnavailableError extends Error {
  constructor(message = 'Persistence is unavailable.') {
    super(message);
    this.name = 'RepositoryUnavailableError';
  }
}
