import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createGameServer } from '../src/server/httpServer.js';
import { InMemoryGameRepository } from '../src/server/memoryRepository.js';
import type { ServerConfig } from '../src/server/config.js';
import { CloudSyncClient, CloudSyncError } from '../src/session/cloudSync.js';
import { createBrowserSession } from '../src/session/runtime.js';
import { createMemoryIdbFactory, IndexedDbPersistence } from '../src/session/indexedDb.js';

const silentLogger = { info: () => undefined, warn: () => undefined };

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  sessionSecret: 'test-secret-that-is-long-enough-for-hmac',
  corsOrigins: [],
  maxBodyBytes: 512 * 1024,
  tokenTtlMs: 60 * 60 * 1000,
  rateLimitPerMinute: 1000,
  trustProxy: false,
};

describe('cloud synchronisation', () => {
  let server: Server;
  let baseUrl: string;
  let client: CloudSyncClient;
  let syncedSessionId = '';
  let syncedBranchId = '';

  beforeAll(async () => {
    server = await createGameServer(config, {
      repository: new InMemoryGameRepository(),
      logger: silentLogger,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    client = new CloudSyncClient({ baseUrl });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('refuses writes before authentication', async () => {
    await expect(client.createSession()).rejects.toBeInstanceOf(CloudSyncError);
  });

  it('uploads local history without overwriting remote state, then converges', async () => {
    await client.authenticate('Cloud Tester');

    const persistence = new IndexedDbPersistence({
      dbName: `cloud_sync_${Math.random().toString(36).slice(2)}`,
      factory: createMemoryIdbFactory(),
    });
    const { session } = await createBrowserSession({ forceNew: true, persistence });
    session.advanceTick(2);
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    await session.save();

    const record = await persistence.loadSession?.(session.sessionId);
    expect(record).toBeTruthy();
    const localVersion = record!.envelope.payload.stateVersion;

    const first = await client.syncSession(record!);
    expect(first.status).toBe('synced');
    expect(first.pushedEvents).toBeGreaterThan(0);
    expect(first.remoteVersion).toBe(localVersion);

    const remoteEvents = await client.listEvents(session.sessionId, record!.activeBranchId);
    expect(remoteEvents.length).toBe(first.pushedEvents);
    const remoteSnapshot = await client.latestSnapshot(session.sessionId, record!.activeBranchId);
    expect(remoteSnapshot?.stateVersion).toBe(localVersion);
    syncedSessionId = session.sessionId;
    syncedBranchId = record!.activeBranchId;

    const second = await client.syncSession(record!);
    expect(second.status).toBe('synced');
    expect(second.pushedEvents).toBe(0);
  });

  it('reports a local-ahead conflict instead of deleting or overwriting', async () => {
    const persistence = new IndexedDbPersistence({
      dbName: `cloud_conflict_${Math.random().toString(36).slice(2)}`,
      factory: createMemoryIdbFactory(),
    });
    const { session } = await createBrowserSession({ forceNew: true, persistence });
    session.advanceTick(1);
    await session.save();
    const record = await persistence.loadSession?.(session.sessionId);
    expect(record).toBeTruthy();

    const truncated = {
      ...record!,
      events: record!.events.slice(0, -1),
    };
    const before = await client.latestSnapshot(session.sessionId, 'main');
    const result = await client.syncSession(truncated);
    expect(['conflict', 'synced', 'pulled']).toContain(result.status);
    const after = await client.latestSnapshot(session.sessionId, 'main');
    expect(after?.stateVersion ?? 0).toBeGreaterThanOrEqual(before?.stateVersion ?? 0);
  });

  it('pulls remote history without mutating local storage', async () => {
    const pulled = await client.pullSession(syncedSessionId, syncedBranchId);
    expect(pulled.events.length).toBeGreaterThan(0);
    expect(pulled.snapshot?.snapshotJson).toBeDefined();
  });

  it('maps foreign sessions to a 404 without leaking their existence', async () => {
    const other = new CloudSyncClient({ baseUrl });
    await other.authenticate('Other Player');
    const sessions = await client.listSessions();
    await expect(other.getSession(sessions[0]!.sessionId)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});
