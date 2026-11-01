import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createGameServer } from '../src/server/httpServer.js';
import { InMemoryGameRepository } from '../src/server/memoryRepository.js';
import type { ServerConfig } from '../src/server/config.js';
import { CloudSyncClient } from '../src/session/cloudSync.js';
import { syncDurableSession } from '../src/session/cloudRuntime.js';
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

describe('browser cloud runtime', () => {
  let server: Server;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    server = await createGameServer(config, {
      repository: new InMemoryGameRepository(),
      logger: silentLogger,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    const client = new CloudSyncClient({ baseUrl });
    await client.authenticate('Runtime Tester');
    token = client.authToken ?? '';
    expect(token.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('uploads a durable IndexedDB session through the runtime helper', async () => {
    const persistence = new IndexedDbPersistence({
      dbName: `runtime_sync_${Math.random().toString(36).slice(2)}`,
      factory: createMemoryIdbFactory(),
    });
    const { session } = await createBrowserSession({ forceNew: true, persistence });
    session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    await session.save();

    const outcome = await syncDurableSession(persistence, session.sessionId, {
      baseUrl,
      token,
    });

    expect(outcome.status).toBe('synced');
    expect(outcome.pushedEvents).toBeGreaterThan(0);
    expect(outcome.message).toContain('Yugabyte');

    const client = new CloudSyncClient({ baseUrl, token });
    const record = await persistence.loadSession(session.sessionId);
    const events = await client.listEvents(session.sessionId, record!.activeBranchId);
    expect(events.length).toBe(outcome.pushedEvents);
  });

  it('keeps the local save when the cloud is unreachable', async () => {
    const persistence = new IndexedDbPersistence({
      dbName: `runtime_offline_${Math.random().toString(36).slice(2)}`,
      factory: createMemoryIdbFactory(),
    });
    const { session } = await createBrowserSession({ forceNew: true, persistence });
    await session.save();

    const outcome = await syncDurableSession(persistence, session.sessionId, {
      baseUrl: 'http://127.0.0.1:1',
      token,
    });

    expect(outcome.status).toBe('unavailable');
    expect(outcome.pushedEvents).toBe(0);
    expect(await persistence.loadSession(session.sessionId)).toBeTruthy();
  });
});
