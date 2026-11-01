import type {
  BranchSnapshotRecord,
  PersistencePort,
  SessionDurableRecord,
} from '../engine/index.js';

/**
 * Safe local <-> cloud synchronisation.
 *
 * Rules:
 * - Local IndexedDB remains authoritative for an offline player.
 * - Cloud writes are append-only events guarded by optimistic concurrency.
 * - Nothing is deleted or overwritten. A divergent branch or a stale head is
 *   reported as a conflict so the caller can fork or restore explicitly.
 * - The bearer token is held in memory only; it is never written to IndexedDB,
 *   localStorage or a URL.
 */

export interface CloudSession {
  readonly sessionId: string;
  readonly playerId: string;
  readonly scenarioId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CloudBranch {
  readonly sessionId: string;
  readonly branchId: string;
  readonly parentBranchId: string | null;
  readonly forkEventId: string | null;
  readonly branchName: string;
  readonly createdAt: string;
  readonly headVersion: number;
}

export interface CloudEvent {
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

export interface CloudSnapshot {
  readonly sessionId: string;
  readonly branchId: string;
  readonly stateVersion: number;
  readonly stateHash: string;
  readonly snapshotJson: unknown;
  readonly createdAt: string;
}

export class CloudSyncError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'CloudSyncError';
    this.status = status;
    this.code = code;
  }
}

export interface SyncResult {
  readonly status: 'synced' | 'pulled' | 'conflict' | 'unavailable';
  readonly sessionId: string;
  readonly pushedEvents: number;
  readonly remoteVersion: number;
  readonly localVersion: number;
  readonly remoteSnapshot?: CloudSnapshot;
  readonly message?: string;
}

export interface CloudSyncOptions {
  readonly baseUrl: string;
  readonly token?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

export class CloudSyncClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private token: string | null;
  private playerId: string | null = null;

  constructor(options: CloudSyncOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.token = options.token ?? null;
  }

  get identity(): { playerId: string | null; authenticated: boolean } {
    return { playerId: this.playerId, authenticated: this.token !== null };
  }

  /** Obtains an anonymous bearer identity. The token stays in memory. */
  async authenticate(displayName?: string): Promise<{ playerId: string; expiresAt: string }> {
    const response = await this.request<{ playerId: string; token: string; expiresAt: string }>(
      '/api/auth/anonymous',
      { method: 'POST', body: displayName ? { displayName } : {} },
    );
    this.token = response.token;
    this.playerId = response.playerId;
    return { playerId: response.playerId, expiresAt: response.expiresAt };
  }

  async createSession(input: {
    sessionId?: string;
    scenarioId?: string;
  } = {}): Promise<CloudSession> {
    return this.request<CloudSession>('/api/sessions', { method: 'POST', body: input });
  }

  async getSession(sessionId: string): Promise<CloudSession> {
    return this.request<CloudSession>(`/api/sessions/${encodeURIComponent(sessionId)}`);
  }

  async listSessions(): Promise<readonly CloudSession[]> {
    const response = await this.request<{ sessions: CloudSession[] }>('/api/sessions');
    return response.sessions;
  }

  async listBranches(sessionId: string): Promise<readonly CloudBranch[]> {
    const response = await this.request<{ branches: CloudBranch[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/branches`,
    );
    return response.branches;
  }

  async createBranch(
    sessionId: string,
    input: {
      branchId: string;
      parentBranchId: string | null;
      forkEventId: string | null;
      branchName: string;
    },
  ): Promise<CloudBranch> {
    return this.request<CloudBranch>(`/api/sessions/${encodeURIComponent(sessionId)}/branches`, {
      method: 'POST',
      body: input,
    });
  }

  async listEvents(sessionId: string, branchId = 'main'): Promise<readonly CloudEvent[]> {
    const response = await this.request<{ events: CloudEvent[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/events?branchId=${encodeURIComponent(branchId)}`,
    );
    return response.events;
  }

  async latestSnapshot(sessionId: string, branchId = 'main'): Promise<CloudSnapshot | null> {
    try {
      return await this.request<CloudSnapshot>(
        `/api/sessions/${encodeURIComponent(sessionId)}/snapshot?branchId=${encodeURIComponent(branchId)}`,
      );
    } catch (error) {
      if (error instanceof CloudSyncError && error.status === 404) return null;
      throw error;
    }
  }

  async commitEvent(
    sessionId: string,
    input: {
      branchId: string;
      eventId: string;
      sequenceNo: number;
      stateVersion: number;
      expectedVersion: number;
      eventType: string;
      eventJson: Record<string, unknown>;
      idempotencyKey: string;
      stateHash?: string;
      snapshotJson?: Record<string, unknown>;
    },
  ): Promise<{ status: 'committed' | 'duplicate'; eventId: string; stateVersion: number }> {
    return this.request(
      `/api/sessions/${encodeURIComponent(sessionId)}/events`,
      { method: 'POST', body: input, idempotencyKey: input.idempotencyKey },
    );
  }

  /**
   * Pushes only events the cloud is missing, in order, with OCC. Returns
   * `pulled` when the cloud is ahead, and `conflict` when histories diverged.
   */
  async syncSession(record: SessionDurableRecord): Promise<SyncResult> {
    const sessionId = record.envelope.sessionId;
    const branchId = record.activeBranchId;
    const localVersion = record.envelope.payload.stateVersion;
    try {
      await this.ensureSession(sessionId);
      let branches = await this.listBranches(sessionId);
      if (!branches.some((branch) => branch.branchId === branchId)) {
        const parent = branches.find((branch) => branch.branchId === 'main') ?? branches[0];
        await this.createBranch(sessionId, {
          branchId,
          parentBranchId: parent?.branchId ?? null,
          forkEventId: null,
          branchName: `Restored ${branchId}`,
        });
        branches = await this.listBranches(sessionId);
      }
      const branch = branches.find((candidate) => candidate.branchId === branchId);
      const remote = await this.latestSnapshot(sessionId, branchId);
      const remoteVersion = branch?.headVersion ?? remote?.stateVersion ?? 0;

      if (remoteVersion >= localVersion) {
        return {
          status: remoteVersion === localVersion ? 'synced' : 'pulled',
          sessionId,
          pushedEvents: 0,
          remoteVersion,
          localVersion,
          ...(remote ? { remoteSnapshot: remote } : {}),
        };
      }

      const hashes = new Map<number, string>(
        record.branchSnapshots.map((snapshot) => [snapshot.stateVersion, snapshot.stateHash]),
      );
      hashes.set(localVersion, record.envelope.engineStateHash);

      const pending = record.events
        .filter((event) => event.branchId === branchId && event.stateVersion > remoteVersion)
        .sort((a, b) => a.stateVersion - b.stateVersion);

      if (pending.length === 0) {
        return {
          status: 'conflict',
          sessionId,
          pushedEvents: 0,
          remoteVersion,
          localVersion,
          message: 'Local state is ahead but no matching events are available for upload.',
        };
      }

      let pushed = 0;
      let expectedVersion = remoteVersion;
      for (const event of pending) {
        if (event.stateVersion !== expectedVersion + 1) {
          return {
            status: 'conflict',
            sessionId,
            pushedEvents: pushed,
            remoteVersion: expectedVersion,
            localVersion,
            message: `Cloud history diverged at version ${event.stateVersion}.`,
          };
        }
        const state = stateForVersion(record, event.stateVersion);
        try {
          await this.commitEvent(sessionId, {
            branchId,
            eventId: event.eventId,
            sequenceNo: event.sequenceNo,
            stateVersion: event.stateVersion,
            expectedVersion,
            eventType: event.type,
            eventJson: event as unknown as Record<string, unknown>,
            idempotencyKey: event.idempotencyKey || `${sessionId}:${event.eventId}`,
            ...(state
              ? {
                  stateHash: hashes.get(event.stateVersion) ?? record.envelope.engineStateHash,
                  snapshotJson: state as unknown as Record<string, unknown>,
                }
              : {}),
          });
          pushed += 1;
          expectedVersion = event.stateVersion;
        } catch (error) {
          if (error instanceof CloudSyncError && error.status === 409) {
            return {
              status: 'conflict',
              sessionId,
              pushedEvents: pushed,
              remoteVersion: expectedVersion,
              localVersion,
              message: 'Another writer advanced the branch. Local data was left untouched.',
            };
          }
          throw error;
        }
      }

      return { status: 'synced', sessionId, pushedEvents: pushed, remoteVersion: localVersion, localVersion };
    } catch (error) {
      if (error instanceof CloudSyncError) throw error;
      return {
        status: 'unavailable',
        sessionId,
        pushedEvents: 0,
        remoteVersion: 0,
        localVersion,
        message: 'Cloud is unreachable; local save is unchanged.',
      };
    }
  }

  /** Pulls cloud history without touching local storage. */
  async pullSession(
    sessionId: string,
    branchId = 'main',
  ): Promise<{ snapshot: CloudSnapshot | null; events: readonly CloudEvent[] }> {
    const [snapshot, events] = await Promise.all([
      this.latestSnapshot(sessionId, branchId),
      this.listEvents(sessionId, branchId),
    ]);
    return { snapshot, events };
  }

  private async ensureSession(sessionId: string): Promise<CloudSession> {
    try {
      return await this.getSession(sessionId);
    } catch (error) {
      if (!(error instanceof CloudSyncError) || error.status !== 404) throw error;
      return this.createSession({ sessionId });
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (path !== '/api/auth/anonymous' && !this.token) {
      throw new CloudSyncError(401, 'unauthorized', 'Call authenticate() before writing to the cloud.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!response.ok) {
        throw new CloudSyncError(
          response.status,
          typeof payload.error === 'string' ? payload.error : 'request_failed',
          typeof payload.message === 'string' ? payload.message : undefined,
        );
      }
      return payload as T;
    } catch (error) {
      if (error instanceof CloudSyncError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CloudSyncError(0, 'timeout', 'Cloud request timed out.');
      }
      throw new CloudSyncError(0, 'network_error', 'Cloud request failed.');
    } finally {
      clearTimeout(timer);
    }
  }
}

function stateForVersion(
  record: SessionDurableRecord,
  stateVersion: number,
): BranchSnapshotRecord['state'] | null {
  const snapshot = record.branchSnapshots.find(
    (candidate) =>
      candidate.branchId === record.activeBranchId && candidate.stateVersion === stateVersion,
  );
  if (snapshot) return snapshot.state;
  if (record.envelope.payload.stateVersion === stateVersion) return record.envelope.payload;
  return null;
}

/** Convenience helper: sync every durable session without deleting anything. */
export async function syncAllSessions(
  client: CloudSyncClient,
  persistence: PersistencePort,
): Promise<readonly SyncResult[]> {
  const results: SyncResult[] = [];
  for (const summary of await persistence.list()) {
    const record = await persistence.loadSession?.(summary.sessionId);
    if (!record) continue;
    results.push(await client.syncSession(record));
  }
  return results;
}
