import { randomUUID } from 'node:crypto';
import type {
  CommitEventInput,
  CommitResult,
  CreateBranchInput,
  CreateSessionInput,
  GameRepository,
  StoredBranch,
  StoredEvent,
  StoredSession,
  StoredSnapshot,
  MekoOutboxRecord,
} from './repository.ts';

/**
 * Reference implementation of the persistence contract. It mirrors the
 * YugabyteDB semantics exactly (idempotency, optimistic concurrency, monotonic
 * sequence numbers) and is used by tests and by `DATABASE_URL`-less local runs.
 * It is intentionally in-memory: it is never presented as durable storage.
 */
export class InMemoryGameRepository implements GameRepository {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly branches = new Map<string, StoredBranch>();
  private readonly events: StoredEvent[] = [];
  private readonly snapshots: StoredSnapshot[] = [];
  private readonly mekoOutbox = new Map<string, MekoOutboxRecord>();
  private healthy = true;

  setHealthy(value: boolean): void {
    this.healthy = value;
  }

  async health(): Promise<boolean> {
    return this.healthy;
  }

  async createSession(input: CreateSessionInput): Promise<StoredSession> {
    const existing = this.sessions.get(input.sessionId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const session: StoredSession = {
      sessionId: input.sessionId,
      playerId: input.playerId,
      scenarioId: input.scenarioId,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.sessionId, session);
    const branchId = input.branchId ?? 'main';
    this.branches.set(`${session.sessionId}:${branchId}`, {
      sessionId: session.sessionId,
      branchId,
      parentBranchId: null,
      forkEventId: null,
      branchName: input.branchName ?? 'Main',
      createdAt: now,
      headVersion: 0,
    });
    return session;
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async listSessions(playerId: string): Promise<readonly StoredSession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.playerId === playerId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async getBranch(sessionId: string, branchId: string): Promise<StoredBranch | null> {
    return this.branches.get(`${sessionId}:${branchId}`) ?? null;
  }

  async listBranches(sessionId: string): Promise<readonly StoredBranch[]> {
    return [...this.branches.values()].filter((branch) => branch.sessionId === sessionId);
  }

  async createBranch(input: CreateBranchInput): Promise<StoredBranch> {
    const key = `${input.sessionId}:${input.branchId}`;
    const existing = this.branches.get(key);
    if (existing) return existing;
    const branch: StoredBranch = {
      ...input,
      createdAt: new Date().toISOString(),
      headVersion: 0,
    };
    this.branches.set(key, branch);
    return branch;
  }

  async listEvents(sessionId: string, branchId: string): Promise<readonly StoredEvent[]> {
    return this.events
      .filter((event) => event.sessionId === sessionId && event.branchId === branchId)
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
  }

  async latestSnapshot(sessionId: string, branchId: string): Promise<StoredSnapshot | null> {
    const rows = this.snapshots
      .filter((snapshot) => snapshot.sessionId === sessionId && snapshot.branchId === branchId)
      .sort((a, b) => b.stateVersion - a.stateVersion);
    return rows[0] ?? null;
  }

  async getSnapshot(
    sessionId: string,
    branchId: string,
    stateVersion: number,
  ): Promise<StoredSnapshot | null> {
    return (
      this.snapshots.find(
        (snapshot) =>
          snapshot.sessionId === sessionId &&
          snapshot.branchId === branchId &&
          snapshot.stateVersion === stateVersion,
      ) ?? null
    );
  }

  async commitEvent(input: CommitEventInput): Promise<CommitResult> {
    const { event, snapshot, expectedVersion } = input;
    const duplicate = this.events.find(
      (candidate) =>
        candidate.sessionId === event.sessionId && candidate.idempotencyKey === event.idempotencyKey,
    );
    if (duplicate) return { status: 'duplicate', event: duplicate };

    const branch = this.branches.get(`${event.sessionId}:${event.branchId}`);
    if (!branch) return { status: 'conflict', currentVersion: 0 };
    const currentVersion = branch.headVersion;
    if (currentVersion !== expectedVersion || event.stateVersion !== expectedVersion + 1) {
      return { status: 'conflict', currentVersion };
    }

    const sequenceMax = this.events
      .filter((candidate) => candidate.sessionId === event.sessionId && candidate.branchId === event.branchId)
      .reduce((max, candidate) => Math.max(max, candidate.sequenceNo), 0);
    if (event.sequenceNo <= sequenceMax) return { status: 'conflict', currentVersion };

    const now = new Date().toISOString();
    const storedEvent: StoredEvent = { ...event, createdAt: now };
    const storedSnapshot: StoredSnapshot | null = snapshot ? { ...snapshot, createdAt: now } : null;
    this.events.push(storedEvent);
    if (storedSnapshot) this.snapshots.push(storedSnapshot);
    this.branches.set(`${event.sessionId}:${event.branchId}`, { ...branch, headVersion: event.stateVersion });
    const session = this.sessions.get(event.sessionId);
    if (session) this.sessions.set(session.sessionId, { ...session, updatedAt: now });
    return { status: 'committed', event: storedEvent, snapshot: storedSnapshot };
  }

  async enqueueMekoMemory(record: MekoOutboxRecord): Promise<void> {
    this.mekoOutbox.set(`${record.sessionId}:${record.eventId}`, record);
  }

  async listPendingMekoMemories(limit = 100): Promise<readonly MekoOutboxRecord[]> {
    return [...this.mekoOutbox.values()].slice(0, limit);
  }

  async markMekoMemoryDelivered(sessionId: string, eventId: string): Promise<void> {
    this.mekoOutbox.delete(`${sessionId}:${eventId}`);
  }

  /** Test helper: deterministic ids without leaking node:crypto into callers. */
  static newId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  async close(): Promise<void> {
    this.sessions.clear();
    this.branches.clear();
    this.events.length = 0;
    this.snapshots.length = 0;
    this.mekoOutbox.clear();
  }
}
