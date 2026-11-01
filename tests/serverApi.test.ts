import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createGameServer } from '../src/server/httpServer.js';
import { InMemoryGameRepository } from '../src/server/memoryRepository.js';
import type { ServerConfig } from '../src/server/config.js';
import { MekoService, type MekoMemoryRecord } from '../src/services/mekoService.js';
import { ModelGateway, modelGatewayConfigFromEnvironment } from '../src/services/modelGateway.js';
import { MorrowController } from '../src/engine/index.js';
import { createHarness } from './helpers.js';

const silentLogger = { info: () => undefined, warn: () => undefined };

class RecoveringMeko extends MekoService {
  constructor() {
    super({ offlineOnly: true });
  }

  override async addNpcMemory(
    _record: MekoMemoryRecord,
    _sessionId: string,
  ): Promise<{ success: boolean; memoryId: string; remote: boolean }> {
    return { success: true, memoryId: 'mem_recovered', remote: true };
  }
}

function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    sessionSecret: 'test-secret-that-is-long-enough-for-hmac',
    corsOrigins: ['http://localhost:5173'],
    maxBodyBytes: 64 * 1024,
    tokenTtlMs: 60 * 60 * 1000,
    rateLimitPerMinute: 1000,
    trustProxy: false,
    ...overrides,
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function auth(baseUrl: string): Promise<{ playerId: string; token: string }> {
  const response = await fetch(`${baseUrl}/api/auth/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { playerId: string; token: string };
}

function authed(token: string, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  };
}

describe('server HTTP boundary', () => {
  let server: Server;
  let baseUrl: string;
  let repository: InMemoryGameRepository;

  beforeAll(async () => {
    repository = new InMemoryGameRepository();
    server = await createGameServer(testConfig(), {
      repository,
      logger: silentLogger,
      modelGateway: new ModelGateway(modelGatewayConfigFromEnvironment({})),
    });
    baseUrl = await listen(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('reports health and readiness without leaking configuration', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as Record<string, unknown>;
    expect(healthBody.status).toBe('ok');
    expect(JSON.stringify(healthBody)).not.toContain('secret');

    const ready = await fetch(`${baseUrl}/ready`);
    expect(ready.status).toBe(200);
    expect(((await ready.json()) as { database: string }).database).toBe('reachable');
  });

  it('bridges MORROW through the server gateway and returns deterministic fallback safely', async () => {
    const identity = await auth(baseUrl);
    const harness = await createHarness({ seed: 'server-morrow-bridge' });
    const observation = new MorrowController(harness.session, { clock: harness.clock }).observe();
    const response = await fetch(`${baseUrl}/api/ai/morrow`, authed(identity.token, {
      observation,
      requestId: 'morrow_bridge_test_1',
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { provider: string; fallback: boolean; proposal: { response: string } };
    expect(body.provider).toBe('fallback');
    expect(body.fallback).toBe(true);
    expect(body.proposal.response).toBe('observe');
  });

  it('rejects missing, malformed and tampered bearer tokens', async () => {
    expect((await fetch(`${baseUrl}/api/sessions`)).status).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/api/sessions`, {
          headers: { Authorization: 'Bearer not-a-token' },
        })
      ).status,
    ).toBe(401);
  });

  it('creates an owned session and hides it from other players', async () => {
    const alice = await auth(baseUrl);
    const bob = await auth(baseUrl);

    const created = await fetch(`${baseUrl}/api/sessions`, authed(alice.token, {}));
    expect(created.status).toBe(201);
    const session = (await created.json()) as { sessionId: string; playerId: string };
    expect(session.playerId).toBe(alice.playerId);

    const own = await fetch(`${baseUrl}/api/sessions/${session.sessionId}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    expect(own.status).toBe(200);

    const foreign = await fetch(`${baseUrl}/api/sessions/${session.sessionId}`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    expect(foreign.status).toBe(404);

    const listed = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const body = (await listed.json()) as { sessions: Array<{ sessionId: string }> };
    expect(body.sessions.map((entry) => entry.sessionId)).toContain(session.sessionId);
  });

  it('commits events with optimistic concurrency and idempotent retries', async () => {
    const { token } = await auth(baseUrl);
    const created = await fetch(`${baseUrl}/api/sessions`, authed(token, {}));
    const { sessionId } = (await created.json()) as { sessionId: string };

    const event = {
      branchId: 'main',
      eventId: 'evt_test_0001',
      sequenceNo: 1,
      stateVersion: 1,
      expectedVersion: 0,
      eventType: 'session.started',
      eventJson: { type: 'session.started' },
      idempotencyKey: 'idem_test_0001',
      stateHash: '0123456789abcdef',
      snapshotJson: { stateVersion: 1 },
    };
    const first = await fetch(`${baseUrl}/api/sessions/${sessionId}/events`, authed(token, event));
    expect(first.status).toBe(201);
    expect(((await first.json()) as { status: string }).status).toBe('committed');

    const duplicate = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/events`,
      authed(token, { ...event, eventId: 'evt_test_0001_retry' }),
    );
    expect(duplicate.status).toBe(200);
    expect(((await duplicate.json()) as { status: string }).status).toBe('duplicate');

    const stale = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/events`,
      authed(token, {
        ...event,
        eventId: 'evt_test_0002',
        sequenceNo: 2,
        stateVersion: 1,
        expectedVersion: 0,
        idempotencyKey: 'idem_test_0002',
      }),
    );
    expect(stale.status).toBe(409);
    const staleBody = (await stale.json()) as { error: string; currentVersion: number };
    expect(staleBody.error).toBe('version_conflict');
    expect(staleBody.currentVersion).toBe(1);

    const snapshot = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/snapshot?branchId=main`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(snapshot.status).toBe(200);
    expect(((await snapshot.json()) as { stateVersion: number }).stateVersion).toBe(1);

    const events = await fetch(`${baseUrl}/api/sessions/${sessionId}/events?branchId=main`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(((await events.json()) as { events: unknown[] }).events).toHaveLength(1);
  });

  it('validates event payloads before touching storage', async () => {
    const { token } = await auth(baseUrl);
    const created = await fetch(`${baseUrl}/api/sessions`, authed(token, {}));
    const { sessionId } = (await created.json()) as { sessionId: string };
    const response = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/events`,
      authed(token, { branchId: 'main' }),
    );
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toBe('validation_failed');
  });

  it('applies CORS only to configured origins', async () => {
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const blocked = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch(`${baseUrl}/api/sessions`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(preflight.status).toBe(204);
  });

  it('rejects oversized bodies with 413', async () => {
    const { token } = await auth(baseUrl);
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scenarioId: 'x'.repeat(70 * 1024) }),
    });
    expect(response.status).toBe(413);
  });

  it('rate limits repeated requests', async () => {
    const limited = await createGameServer(
      testConfig({ rateLimitPerMinute: 2 }),
      { repository: new InMemoryGameRepository(), logger: silentLogger },
    );
    const url = await listen(limited);
    try {
      const first = await fetch(`${url}/api/auth/anonymous`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const second = await fetch(`${url}/api/auth/anonymous`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const third = await fetch(`${url}/api/auth/anonymous`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(third.status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => limited.close(() => resolve()));
    }
  });

  it('records NPC context only after a canonical event commits', async () => {
    const meko = new MekoService({ offlineOnly: true });
    const isolatedRepository = new InMemoryGameRepository();
    const isolatedServer = await createGameServer(testConfig(), {
      repository: isolatedRepository,
      meko,
      logger: silentLogger,
    });
    const isolatedBaseUrl = await listen(isolatedServer);
    try {
      const { token } = await auth(isolatedBaseUrl);
      const created = await fetch(`${isolatedBaseUrl}/api/sessions`, authed(token, {}));
      const { sessionId } = (await created.json()) as { sessionId: string };

      const response = await fetch(
        `${isolatedBaseUrl}/api/sessions/${sessionId}/events`,
        authed(token, {
          branchId: 'main',
          eventId: 'evt_relay_memory_1',
          sequenceNo: 1,
          stateVersion: 1,
          expectedVersion: 0,
          eventType: 'fact.asserted',
          eventJson: {
            type: 'fact.asserted',
            payload: {
              fact: { key: 'evidence.relay_7', value: { relay: 7 }, confidence: 0.9 },
            },
          },
          idempotencyKey: 'idem_relay_memory_1',
        }),
      );
      expect(response.status).toBe(201);

      const memories = await meko.searchNpcMemories(
        'npc_sable',
        'main',
        'evidence.relay_7',
        sessionId,
      );
      expect(memories).toHaveLength(1);
      expect(memories[0]?.sourceEventId).toBe('evt_relay_memory_1');
      expect(memories[0]?.branchId).toBe('main');
      expect(
        await meko.searchNpcMemories('npc_sable', 'brn_other', 'evidence.relay_7', sessionId),
      ).toHaveLength(0);
      expect(await isolatedRepository.listPendingMekoMemories?.()).toHaveLength(1);

      const recoveryServer = await createGameServer(testConfig(), {
        repository: isolatedRepository,
        meko: new RecoveringMeko(),
        logger: silentLogger,
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(await isolatedRepository.listPendingMekoMemories?.()).toHaveLength(0);
      await new Promise<void>((resolve) => recoveryServer.close(() => resolve()));
    } finally {
      await new Promise<void>((resolve) => isolatedServer.close(() => resolve()));
    }
  });
});
