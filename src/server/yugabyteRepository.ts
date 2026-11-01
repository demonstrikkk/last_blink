import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { ServerConfig } from './config.ts';
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

interface SessionRow {
  session_id: string;
  player_id: string;
  scenario_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BranchRow {
  session_id: string;
  branch_id: string;
  parent_branch_id: string | null;
  fork_event_id: string | null;
  branch_name: string;
  created_at: Date | string;
  head_version: string | number | null;
}

interface EventRow {
  session_id: string;
  event_id: string;
  branch_id: string;
  sequence_no: string | number;
  state_version: string | number;
  event_type: string;
  event_json: unknown;
  idempotency_key: string;
  created_at: Date | string;
}

interface SnapshotRow {
  session_id: string;
  branch_id: string;
  state_version: string | number;
  state_hash: string;
  snapshot_json: unknown;
  created_at: Date | string;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const num = (value: string | number | null | undefined): number => Number(value ?? 0);

function mapSession(row: SessionRow): StoredSession {
  return {
    sessionId: row.session_id,
    playerId: row.player_id,
    scenarioId: row.scenario_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapBranch(row: BranchRow): StoredBranch {
  return {
    sessionId: row.session_id,
    branchId: row.branch_id,
    parentBranchId: row.parent_branch_id,
    forkEventId: row.fork_event_id,
    branchName: row.branch_name,
    createdAt: iso(row.created_at),
    headVersion: num(row.head_version),
  };
}

function mapEvent(row: EventRow): StoredEvent {
  return {
    sessionId: row.session_id,
    eventId: row.event_id,
    branchId: row.branch_id,
    sequenceNo: num(row.sequence_no),
    stateVersion: num(row.state_version),
    eventType: row.event_type,
    eventJson: row.event_json,
    idempotencyKey: row.idempotency_key,
    createdAt: iso(row.created_at),
  };
}

function mapSnapshot(row: SnapshotRow): StoredSnapshot {
  return {
    sessionId: row.session_id,
    branchId: row.branch_id,
    stateVersion: num(row.state_version),
    stateHash: row.state_hash,
    snapshotJson: row.snapshot_json,
    createdAt: iso(row.created_at),
  };
}

function poolConfig(databaseUrl: string, ca?: string): PoolConfig {
  if (!ca) {
    throw new Error(
      'DATABASE_SSL_CA must point to the Yugabyte root certificate; TLS verification cannot be disabled.',
    );
  }
  return {
    connectionString: databaseUrl,
    ssl: { ca, rejectUnauthorized: true },
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    // Abort runaway statements instead of holding a connection forever.
    statement_timeout: 10_000,
    query_timeout: 10_000,
    application_name: 'the-last-blink',
  } as PoolConfig;
}

/**
 * YugabyteDB (YSQL) adapter. Uses the PostgreSQL wire protocol with mandatory
 * TLS verification against the Yugabyte Cloud root CA. Credentials and the CA
 * PEM never leave this server process.
 */
export class YugabyteGameRepository implements GameRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string, ca: string) {
    this.pool = new Pool(poolConfig(databaseUrl, ca));
    this.pool.on('error', () => {
      // Idle client errors are surfaced through health/readiness rather than
      // crashing the process; the pg pool replaces dead clients.
    });
  }

  async health(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  /** Public transaction hook used by migrations and operational tooling. */
  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withTransaction(work);
  }

  async createSession(input: CreateSessionInput): Promise<StoredSession> {
    const branchId = input.branchId ?? 'main';
    return this.transaction(async (client) => {
      await client.query(
        `INSERT INTO game_sessions(session_id, player_id, scenario_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id) DO NOTHING`,
        [input.sessionId, input.playerId, input.scenarioId],
      );
      await client.query(
        `INSERT INTO game_branches(session_id, branch_id, parent_branch_id, fork_event_id, branch_name)
         VALUES ($1, $2, NULL, NULL, $3)
         ON CONFLICT (session_id, branch_id) DO NOTHING`,
        [input.sessionId, branchId, input.branchName ?? 'Main'],
      );
      const result = await client.query<SessionRow>(
        'SELECT * FROM game_sessions WHERE session_id = $1',
        [input.sessionId],
      );
      return mapSession(result.rows[0]!);
    });
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    const result = await this.pool.query<SessionRow>(
      'SELECT * FROM game_sessions WHERE session_id = $1',
      [sessionId],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async listSessions(playerId: string): Promise<readonly StoredSession[]> {
    const result = await this.pool.query<SessionRow>(
      'SELECT * FROM game_sessions WHERE player_id = $1 ORDER BY updated_at DESC LIMIT 50',
      [playerId],
    );
    return result.rows.map(mapSession);
  }

  async getBranch(sessionId: string, branchId: string): Promise<StoredBranch | null> {
    const result = await this.pool.query<BranchRow>(
      'SELECT * FROM game_branches WHERE session_id = $1 AND branch_id = $2',
      [sessionId, branchId],
    );
    return result.rows[0] ? mapBranch(result.rows[0]) : null;
  }

  async listBranches(sessionId: string): Promise<readonly StoredBranch[]> {
    const result = await this.pool.query<BranchRow>(
      'SELECT * FROM game_branches WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId],
    );
    return result.rows.map(mapBranch);
  }

  async createBranch(input: CreateBranchInput): Promise<StoredBranch> {
    await this.pool.query(
      `INSERT INTO game_branches(session_id, branch_id, parent_branch_id, fork_event_id, branch_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id, branch_id) DO NOTHING`,
      [input.sessionId, input.branchId, input.parentBranchId, input.forkEventId, input.branchName],
    );
    const branch = await this.getBranch(input.sessionId, input.branchId);
    if (!branch) throw new Error('branch creation failed');
    return branch;
  }

  async listEvents(sessionId: string, branchId: string): Promise<readonly StoredEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT * FROM game_events
       WHERE session_id = $1 AND branch_id = $2
       ORDER BY sequence_no ASC
       LIMIT 5000`,
      [sessionId, branchId],
    );
    return result.rows.map(mapEvent);
  }

  async latestSnapshot(sessionId: string, branchId: string): Promise<StoredSnapshot | null> {
    const result = await this.pool.query<SnapshotRow>(
      `SELECT * FROM branch_snapshots
       WHERE session_id = $1 AND branch_id = $2
       ORDER BY state_version DESC LIMIT 1`,
      [sessionId, branchId],
    );
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
  }

  async getSnapshot(
    sessionId: string,
    branchId: string,
    stateVersion: number,
  ): Promise<StoredSnapshot | null> {
    const result = await this.pool.query<SnapshotRow>(
      `SELECT * FROM branch_snapshots
       WHERE session_id = $1 AND branch_id = $2 AND state_version = $3`,
      [sessionId, branchId, stateVersion],
    );
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
  }

  async commitEvent(input: CommitEventInput): Promise<CommitResult> {
    const { event, snapshot, expectedVersion } = input;
    return this.transaction(async (client) => {
      const duplicate = await client.query<EventRow>(
        `SELECT * FROM game_events WHERE session_id = $1 AND idempotency_key = $2`,
        [event.sessionId, event.idempotencyKey],
      );
      if (duplicate.rows[0]) {
        return { status: 'duplicate', event: mapEvent(duplicate.rows[0]) };
      }

      // Serialize every commit for a session. This is the single write lock
      // that makes version checks and sequence allocation race-free.
      const sessionLock = await client.query<{ session_id: string }>(
        'SELECT session_id FROM game_sessions WHERE session_id = $1 FOR UPDATE',
        [event.sessionId],
      );
      if (!sessionLock.rows[0]) return { status: 'conflict', currentVersion: 0 };

      const branch = await client.query<{ head_version: string | number | null }>(
        'SELECT head_version FROM game_branches WHERE session_id = $1 AND branch_id = $2',
        [event.sessionId, event.branchId],
      );
      if (!branch.rows[0]) return { status: 'conflict', currentVersion: 0 };
      const currentVersion = num(branch.rows[0]?.head_version);
      if (currentVersion !== expectedVersion || event.stateVersion !== expectedVersion + 1) {
        return { status: 'conflict', currentVersion };
      }

      const sequence = await client.query<{ max_seq: string | number | null }>(
        `SELECT COALESCE(MAX(sequence_no), 0) AS max_seq
         FROM game_events WHERE session_id = $1 AND branch_id = $2`,
        [event.sessionId, event.branchId],
      );
      if (event.sequenceNo <= num(sequence.rows[0]?.max_seq)) {
        return { status: 'conflict', currentVersion };
      }

      const insertedEvent = await client.query<EventRow>(
        `INSERT INTO game_events
           (session_id, event_id, branch_id, sequence_no, state_version, event_type, event_json, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
         RETURNING *`,
        [
          event.sessionId,
          event.eventId,
          event.branchId,
          event.sequenceNo,
          event.stateVersion,
          event.eventType,
          JSON.stringify(event.eventJson),
          event.idempotencyKey,
        ],
      );
      const insertedSnapshot = snapshot
        ? await client.query<SnapshotRow>(
            `INSERT INTO branch_snapshots(session_id, branch_id, state_version, state_hash, snapshot_json)
             VALUES ($1,$2,$3,$4,$5::jsonb)
             RETURNING *`,
            [
              snapshot.sessionId,
              snapshot.branchId,
              snapshot.stateVersion,
              snapshot.stateHash,
              JSON.stringify(snapshot.snapshotJson),
            ],
          )
        : null;
      await client.query(
        'UPDATE game_branches SET head_version = $3 WHERE session_id = $1 AND branch_id = $2',
        [event.sessionId, event.branchId, event.stateVersion],
      );
      await client.query('UPDATE game_sessions SET updated_at = now() WHERE session_id = $1', [
        event.sessionId,
      ]);

      return {
        status: 'committed',
        event: mapEvent(insertedEvent.rows[0]!),
        snapshot: insertedSnapshot?.rows[0] ? mapSnapshot(insertedSnapshot.rows[0]) : null,
      };
    });
  }

  async enqueueMekoMemory(record: MekoOutboxRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO meko_memory_outbox
         (session_id, event_id, npc_id, branch_id, visibility_scope, content, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (session_id, event_id) DO NOTHING`,
      [record.sessionId, record.eventId, record.npcId, record.branchId, record.visibilityScope, record.content, record.confidence],
    );
  }

  async listPendingMekoMemories(limit = 100): Promise<readonly MekoOutboxRecord[]> {
    const result = await this.pool.query<MekoOutboxRecord>(
      `SELECT session_id AS "sessionId", event_id AS "eventId", npc_id AS "npcId",
              branch_id AS "branchId", visibility_scope AS "visibilityScope", content, confidence
       FROM meko_memory_outbox ORDER BY created_at ASC LIMIT $1`,
      [Math.max(1, Math.min(500, Math.floor(limit)))],
    );
    return result.rows;
  }

  async markMekoMemoryDelivered(sessionId: string, eventId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM meko_memory_outbox WHERE session_id = $1 AND event_id = $2',
      [sessionId, eventId],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Reads the CA file, then constructs the pool. Kept async so a missing or
 * unreadable certificate fails startup rather than silently downgrading TLS.
 */
export async function createYugabyteRepository(config: ServerConfig): Promise<GameRepository> {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!config.databaseSslCaPath) {
    throw new Error('DATABASE_SSL_CA must point to the Yugabyte root certificate.');
  }
  const ca = await readFile(config.databaseSslCaPath, 'utf8');
  if (!ca.includes('BEGIN CERTIFICATE')) {
    throw new Error('DATABASE_SSL_CA does not contain a PEM certificate.');
  }
  return new YugabyteGameRepository(config.databaseUrl, ca);
}
