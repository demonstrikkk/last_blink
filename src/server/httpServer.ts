import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { RateLimiter, signToken, verifyToken } from './auth.ts';
import { loadServerConfig, type ServerConfig } from './config.ts';
import { InMemoryGameRepository } from './memoryRepository.ts';
import type { GameRepository } from './repository.ts';
import { createYugabyteRepository } from './yugabyteRepository.ts';
import { MekoService, mekoConfigFromEnvironment } from '../services/mekoService.ts';
import { ModelGateway, modelGatewayConfigFromEnvironment } from '../services/modelGateway.ts';

const CODES = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  notFound: 'not_found',
  badRequest: 'bad_request',
  validation: 'validation_failed',
  tooLarge: 'payload_too_large',
  conflict: 'version_conflict',
  rateLimited: 'rate_limited',
  unavailable: 'persistence_unavailable',
  internal: 'internal_error',
} as const;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const anonymousSchema = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
});

const createSessionSchema = z.object({
  scenarioId: z.string().trim().min(1).max(64).default('relay_street'),
  sessionId: z.string().trim().regex(/^[A-Za-z0-9_-]{4,96}$/).optional(),
});

const createBranchSchema = z.object({
  branchId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  parentBranchId: z.string().trim().max(64).nullable().default(null),
  forkEventId: z.string().trim().max(96).nullable().default(null),
  branchName: z.string().trim().min(1).max(80),
});

const commitEventSchema = z.object({
  branchId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/).default('main'),
  eventId: z.string().trim().regex(/^[A-Za-z0-9_-]{4,96}$/),
  sequenceNo: z.number().int().positive(),
  stateVersion: z.number().int().positive(),
  expectedVersion: z.number().int().min(0),
  eventType: z.string().trim().min(1).max(64),
  eventJson: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().trim().min(8).max(160),
  stateHash: z.string().trim().min(8).max(160).optional(),
  snapshotJson: z.record(z.string(), z.unknown()).optional(),
});

const morrowAiRequestSchema = z.object({
  observation: z.unknown(),
  requestId: z.string().trim().min(4).max(120),
});

const morrowObservationBridgeSchema = z.object({
  sessionId: z.string().min(1),
  branchId: z.string().min(1),
  observationId: z.string().min(1),
  observationHash: z.string().min(1),
  tick: z.number().int().nonnegative(),
  stateVersion: z.number().int().positive(),
  policyId: z.string().min(1),
  policyVersion: z.string().min(1),
  features: z.object({
    evidenceCount: z.number().int().nonnegative(),
    choicesMade: z.number().int().nonnegative(),
    lastResponse: z.string().nullable(),
    predictedNextMove: z.string().optional(),
  }).passthrough(),
}).passthrough();

const morrowProposalBridgeSchema = z.object({
  schemaVersion: z.number(),
  proposalId: z.string().min(1),
  policyId: z.string().min(1),
  policyVersion: z.string().min(1),
  observationId: z.string().min(1),
  sessionId: z.string().min(1),
  branchId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  basedOnStateVersion: z.number().int().positive(),
  response: z.enum(['observe', 'warn', 'restrict', 'redirect', 'escalate', 'release']),
  reasonCodes: z.array(z.string().min(1)).min(1),
  features: z.record(z.string(), z.unknown()),
  observationHash: z.string().min(1),
  deterministic: z.literal(true),
}).passthrough();

function deterministicMorrowBridgeFallback(observation: z.infer<typeof morrowObservationBridgeSchema>) {
  const response: 'observe' | 'warn' | 'restrict' | 'redirect' | 'escalate' | 'release' = observation.features.lastResponse === null
    ? (observation.features.evidenceCount > 0 ? 'warn' : 'observe')
    : observation.features.lastResponse === 'warn' && observation.features.evidenceCount > 1
      ? 'restrict'
      : observation.features.lastResponse as 'observe' | 'warn' | 'restrict' | 'redirect' | 'escalate' | 'release';
  return {
    schemaVersion: 1,
    proposalId: `prp_${observation.observationHash}`,
    policyId: 'policy.morrow.deterministic',
    policyVersion: observation.policyVersion,
    observationId: observation.observationId,
    sessionId: observation.sessionId,
    branchId: observation.branchId,
    tick: observation.tick,
    basedOnStateVersion: observation.stateVersion,
    response,
    reasonCodes: [observation.features.predictedNextMove ? 'PREDICTION_UPDATE' : 'BASELINE_OBSERVE'],
    features: { predictedNextMove: observation.features.predictedNextMove ?? 'unknown' },
    observationHash: observation.observationHash,
    deterministic: true as const,
  };
}

export interface GameServerOptions {
  readonly repository?: GameRepository;
  /** Optional server-side contextual memory sink. Canonical events remain in repository first. */
  readonly meko?: MekoService;
  readonly modelGateway?: ModelGateway;
  readonly logger?: { info(message: string, detail?: Record<string, unknown>): void; warn(message: string, detail?: Record<string, unknown>): void };
  readonly now?: () => number;
}

function npcForCanonicalEvent(eventType: string, eventJson: Record<string, unknown>): string | null {
  const fact = (eventJson.payload as { fact?: { key?: unknown }} | undefined)?.fact;
  if (eventType === 'fact.asserted' && typeof fact?.key === 'string') {
    const owners: Record<string, string> = {
      'evidence.relay_7': 'npc_sable',
      'evidence.ward_dispatch': 'npc_vane',
      'evidence.vendor_testimony': 'npc_ivo',
      'evidence.human_cost': 'npc_mara',
      'evidence.override_root': 'npc_orin',
      'story.relay_choice': 'npc_sable',
      'story.vendor_choice': 'npc_ivo',
      'story.ward_call': 'npc_sable',
      'story.morrow_terminated': 'npc_mara',
      'story.morrow_mechanism': 'npc_orin',
      'world.dispatch_continuity': 'npc_vane',
      'world.vendor_confidence': 'npc_ivo',
      'world.morrow_scrutiny': 'npc_mara',
    };
    return owners[fact.key] ?? null;
  }
  return null;
}

async function recordNpcMemoryAfterCommit(
  meko: MekoService,
  repository: GameRepository,
  sessionId: string,
  branchId: string,
  eventId: string,
  eventType: string,
  eventJson: Record<string, unknown>,
  logger: { warn(message: string, detail?: Record<string, unknown>): void },
): Promise<void> {
  const npcId = npcForCanonicalEvent(eventType, eventJson);
  if (!npcId) return;
  const fact = (eventJson.payload as { fact?: { key?: unknown; value?: unknown; confidence?: unknown }} | undefined)?.fact;
  if (!fact || typeof fact.key !== 'string') return;

  const record = {
    content: `${fact.key}: ${JSON.stringify(fact.value)}`,
    npcId,
    branchId,
    sourceEventId: eventId,
    visibilityScope: 'CHARACTER_PRIVATE' as const,
    confidence: typeof fact.confidence === 'number' ? fact.confidence : 1,
  };
  const outboxRecord = {
    sessionId,
    eventId,
    npcId,
    branchId,
    visibilityScope: record.visibilityScope,
    content: record.content,
    confidence: record.confidence,
  };
  try {
    const result = await meko.addNpcMemory(record, sessionId);
    if (result.remote) {
      await repository.markMekoMemoryDelivered?.(sessionId, eventId);
    } else {
      await repository.enqueueMekoMemory?.(outboxRecord);
    }
  } catch (error) {
    // YugabyteDB is already authoritative and committed. This failure is safe
    // to reconcile later; it must not turn a durable event into a failed write.
    logger.warn('Meko memory reconciliation required', {
      sessionId,
      eventId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    await repository.enqueueMekoMemory?.(outboxRecord);
  }
}

async function reconcileMekoOutbox(
  meko: MekoService,
  repository: GameRepository,
  logger: { warn(message: string, detail?: Record<string, unknown>): void },
): Promise<void> {
  if (!repository.listPendingMekoMemories || !repository.markMekoMemoryDelivered) return;
  const pending = await repository.listPendingMekoMemories(100);
  for (const record of pending) {
    try {
      const result = await meko.addNpcMemory(
        {
          content: record.content,
          npcId: record.npcId,
          branchId: record.branchId,
          visibilityScope: record.visibilityScope as 'PUBLIC_WORLD' | 'FACTION' | 'CHARACTER_PRIVATE' | 'SYSTEM_SECURITY',
          confidence: record.confidence,
          sourceEventId: record.eventId,
        },
        record.sessionId,
      );
      if (result.remote) await repository.markMekoMemoryDelivered(record.sessionId, record.eventId);
    } catch (error) {
      logger.warn('Meko outbox delivery remains pending', {
        sessionId: record.sessionId,
        eventId: record.eventId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

const REDACT_KEYS = /token|secret|password|authorization|api[-_]?key|cookie/i;

/** Structured, secret-safe log detail. Keys are redacted by name. */
function redact(detail: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    safe[key] = REDACT_KEYS.test(key) ? '[redacted]' : typeof value === 'string' ? value.slice(0, 200) : value;
  }
  return safe;
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: ServerConfig): boolean {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && config.corsOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,Idempotency-Key,X-Request-Id',
    );
    response.setHeader('Access-Control-Max-Age', '600');
  }
  return request.method === 'OPTIONS';
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.writableEnded) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(payload);
}

function sendError(response: ServerResponse, error: HttpError, requestId: string): void {
  sendJson(response, error.status, { error: error.code, message: error.message, requestId });
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, CODES.tooLarge, 'Request body exceeds the configured limit.');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new HttpError(413, CODES.tooLarge, 'Request body exceeds the configured limit.');
    chunks.push(buffer);
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, CODES.badRequest, 'Request body must be valid JSON.');
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new HttpError(422, CODES.validation, detail);
  }
  return result.data;
}

function bearer(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]!.trim();
    }
  }
  return request.socket.remoteAddress ?? 'unknown';
}

/**
 * Builds the HTTP boundary. It owns identity, ownership, validation, limits,
 * CORS, logging and safe errors. Game rules stay inside GameSession and the
 * repository only persists validated results.
 */
export async function createGameServer(
  config: ServerConfig = loadServerConfig(),
  options: GameServerOptions = {},
): Promise<ReturnType<typeof createServer>> {
  const logger = options.logger ?? {
    info: (message: string, detail?: Record<string, unknown>) =>
      console.log(JSON.stringify({ level: 'info', message, ...(detail ? redact(detail) : {}) })),
    warn: (message: string, detail?: Record<string, unknown>) =>
      console.warn(JSON.stringify({ level: 'warn', message, ...(detail ? redact(detail) : {}) })),
  };
  const now = options.now ?? Date.now;
  const meko = options.meko ?? new MekoService(mekoConfigFromEnvironment());
  const modelGateway = options.modelGateway ?? new ModelGateway(modelGatewayConfigFromEnvironment());

  let repository: GameRepository;
  let durability: 'yugabyte' | 'memory';
  if (options.repository) {
    repository = options.repository;
    durability = 'memory';
  } else if (config.databaseUrl) {
    repository = await createYugabyteRepository(config);
    durability = 'yugabyte';
  } else {
    repository = new InMemoryGameRepository();
    durability = 'memory';
  }
  void reconcileMekoOutbox(meko, repository, logger);

  const limiter = new RateLimiter(config.rateLimitPerMinute);
  const startedAt = now();

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const started = now();
    const url = new URL(request.url ?? '/', `http://${config.host}`);
    const path = url.pathname;
    response.setHeader('X-Request-Id', requestId);

    try {
      if (applyCors(request, response, config)) {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === 'GET' && path === '/health') {
        sendJson(response, 200, {
          status: 'ok',
          uptimeSeconds: Math.floor((now() - startedAt) / 1000),
          durability,
        });
        return;
      }

      if (request.method === 'GET' && path === '/ready') {
        const healthy = await repository.health();
        sendJson(response, healthy ? 200 : 503, {
          status: healthy ? 'ready' : 'degraded',
          durability,
          database: healthy ? 'reachable' : 'unreachable',
        });
        return;
      }

      // Everything below is a rate-limited, authenticated API route.
      const ip = clientIp(request, config.trustProxy);
      if (!limiter.allow(`ip:${ip}`, now())) {
        throw new HttpError(429, CODES.rateLimited, 'Too many requests. Retry shortly.');
      }

      if (request.method === 'POST' && path === '/api/auth/anonymous') {
        const body = parse(anonymousSchema, await readJson(request, config.maxBodyBytes));
        const playerId = `ply_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const { token, expiresAt } = signToken(playerId, config.sessionSecret, config.tokenTtlMs, now);
        logger.info('issued anonymous identity', { requestId, playerId, displayName: body.displayName });
        sendJson(response, 201, { playerId, token, expiresAt });
        return;
      }

      const token = bearer(request);
      const claims = token ? verifyToken(token, config.sessionSecret, now) : null;
      if (!claims) throw new HttpError(401, CODES.unauthorized, 'A valid bearer token is required.');

      if (request.method === 'GET' && path === '/api/diagnostics/model') {
        sendJson(response, 200, {
          ...modelGateway.diagnostics(),
          configured: {
            groq: modelGateway.availableProviders().includes('groq'),
            gemini: modelGateway.availableProviders().includes('gemini'),
          },
          gameplayCalls: modelGateway.diagnostics().requests > 0,
          note: 'MORROW may request a typed provider proposal; the deterministic engine remains canonical and falls back when providers fail.',
        });
        return;
      }

      if (request.method === 'POST' && path === '/api/ai/morrow') {
        const body = parse(morrowAiRequestSchema, await readJson(request, config.maxBodyBytes));
        const observation = morrowObservationBridgeSchema.parse(body.observation);
        const fallback = deterministicMorrowBridgeFallback(observation);
        const result = await modelGateway.request({
          task: 'npc_proposal',
          system: 'You are MORROW, a bounded adversarial policy planner. Return only JSON matching the requested schema. You may propose a response, but never invent facts, branch IDs, state versions, or events.',
          prompt: JSON.stringify({ observation, required: 'Return a complete typed MorrowProposal using only this observation.' }),
          schema: morrowProposalBridgeSchema,
          sessionId: observation.sessionId,
          requestId: body.requestId,
          fallback: () => fallback,
        });
        const proposal = morrowProposalBridgeSchema.parse({
          ...result.value,
          sessionId: observation.sessionId,
          branchId: observation.branchId,
          observationId: observation.observationId,
          observationHash: observation.observationHash,
          basedOnStateVersion: observation.stateVersion,
          tick: observation.tick,
        });
        sendJson(response, 200, {
          proposal,
          provider: result.provider,
          model: result.model,
          fallback: result.fallback,
          attempts: result.attempts,
          cacheHit: result.cacheHit,
        });
        return;
      }

      if (request.method === 'POST' && path === '/api/sessions') {
        const body = parse(createSessionSchema, await readJson(request, config.maxBodyBytes));
        const sessionId = body.sessionId ?? `ses_${randomUUID().replace(/-/g, '')}`;
        const session = await repository.createSession({
          sessionId,
          playerId: claims.playerId,
          scenarioId: body.scenarioId,
        });
        sendJson(response, 201, session);
        return;
      }

      if (request.method === 'GET' && path === '/api/sessions') {
        sendJson(response, 200, { sessions: await repository.listSessions(claims.playerId) });
        return;
      }

      const match = path.match(/^\/api\/sessions\/([A-Za-z0-9_-]{4,96})(?:\/(branches|events|snapshot))?$/);
      if (!match) throw new HttpError(404, CODES.notFound, 'Route not found.');
      const sessionId = match[1]!;
      const resource = match[2] ?? null;

      const session = await repository.getSession(sessionId);
      // Foreign sessions are reported as missing so ids cannot be probed.
      if (!session || session.playerId !== claims.playerId) {
        throw new HttpError(404, CODES.notFound, 'Session not found.');
      }

      if (resource === null && request.method === 'GET') {
        sendJson(response, 200, session);
        return;
      }

      if (resource === 'branches' && request.method === 'GET') {
        sendJson(response, 200, { branches: await repository.listBranches(sessionId) });
        return;
      }

      if (resource === 'branches' && request.method === 'POST') {
        const body = parse(createBranchSchema, await readJson(request, config.maxBodyBytes));
        const branch = await repository.createBranch({ sessionId, ...body });
        sendJson(response, 201, branch);
        return;
      }

      if (resource === 'events' && request.method === 'GET') {
        const branchId = url.searchParams.get('branchId') ?? 'main';
        sendJson(response, 200, { events: await repository.listEvents(sessionId, branchId) });
        return;
      }

      if (resource === 'events' && request.method === 'POST') {
        const body = parse(commitEventSchema, await readJson(request, config.maxBodyBytes));
        if (body.stateVersion !== body.expectedVersion + 1) {
          throw new HttpError(422, CODES.validation, 'stateVersion must equal expectedVersion + 1.');
        }
        const idempotencyKey = body.idempotencyKey;
        const result = await repository.commitEvent({
          event: {
            sessionId,
            eventId: body.eventId,
            branchId: body.branchId,
            sequenceNo: body.sequenceNo,
            stateVersion: body.stateVersion,
            eventType: body.eventType,
            eventJson: body.eventJson,
            idempotencyKey,
          },
          snapshot:
            body.snapshotJson && body.stateHash
              ? {
                  sessionId,
                  branchId: body.branchId,
                  stateVersion: body.stateVersion,
                  stateHash: body.stateHash,
                  snapshotJson: body.snapshotJson,
                }
              : null,
          expectedVersion: body.expectedVersion,
        });
        if (result.status === 'duplicate') {
          sendJson(response, 200, { status: 'duplicate', eventId: result.event.eventId });
          return;
        }
        if (result.status === 'conflict') {
          sendJson(response, 409, {
            error: CODES.conflict,
            currentVersion: result.currentVersion,
            requestId,
          });
          return;
        }
        sendJson(response, 201, {
          status: 'committed',
          eventId: result.event.eventId,
          stateVersion: result.event.stateVersion,
        });
        await recordNpcMemoryAfterCommit(
          meko,
          repository,
          sessionId,
          body.branchId,
          body.eventId,
          body.eventType,
          body.eventJson,
          logger,
        );
        return;
      }

      if (resource === 'snapshot' && request.method === 'GET') {
        const branchId = url.searchParams.get('branchId') ?? 'main';
        const versionRaw = url.searchParams.get('version');
        const snapshot =
          versionRaw === null
            ? await repository.latestSnapshot(sessionId, branchId)
            : await repository.getSnapshot(sessionId, branchId, Number(versionRaw));
        if (!snapshot) throw new HttpError(404, CODES.notFound, 'Snapshot not found.');
        sendJson(response, 200, snapshot);
        return;
      }

      throw new HttpError(404, CODES.notFound, 'Route not found.');
    } catch (error) {
      const failure =
        error instanceof HttpError
          ? error
          : new HttpError(500, CODES.internal, 'The request could not be completed.');
      if (!(error instanceof HttpError)) {
        logger.warn('request failed', {
          requestId,
          method: request.method,
          path,
          error: error instanceof Error ? error.name : 'unknown',
        });
      }
      if (failure.status === 500 && durability === 'yugabyte') {
        logger.warn('repository failure', { requestId });
      }
      sendError(response, failure, requestId);
    } finally {
      logger.info('request', {
        requestId,
        method: request.method,
        path,
        status: response.statusCode,
        ms: Math.max(0, now() - started),
      });
    }
  });

  server.on('close', () => {
    void repository.close();
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadServerConfig();
  void createGameServer(config)
    .then((server) => {
      server.listen(config.port, config.host, () => {
        console.log(`[last-blink] listening on http://${config.host}:${config.port}`);
      });
      const shutdown = (signal: string) => {
        console.log(`[last-blink] ${signal} received, draining connections`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((error: unknown) => {
      console.error(
        '[last-blink] server failed to start:',
        error instanceof Error ? error.message : String(error),
      );
      process.exitCode = 1;
    });
}
