import { z } from 'zod';
import { geminiAdapter } from './providers/gemini.ts';
import { groqAdapter } from './providers/groq.ts';
import {
  ProviderError,
  type ProviderAdapter,
  type ProviderName,
} from './providers/types.ts';

export type ModelTask = 'npc_dialogue' | 'npc_proposal' | 'echo_analysis';

export interface ModelRequest<T> {
  readonly task: ModelTask;
  readonly system: string;
  readonly prompt: string;
  readonly schema: z.ZodType<T>;
  readonly sessionId: string;
  readonly requestId: string;
  /** Deterministic value used when no provider is healthy or within budget. */
  readonly fallback: () => T;
  /** Optional stable cache key; defaults to a hash of task+system+prompt. */
  readonly cacheKey?: string;
  /** Tighter request budget for cheap callers. Defaults to the config value. */
  readonly timeoutMs?: number;
}

export interface ModelResponse<T> {
  readonly provider: ProviderName | 'fallback';
  readonly model: string;
  readonly value: T;
  readonly requestId: string;
  readonly fallback: boolean;
  readonly attempts: number;
  readonly cacheHit: boolean;
}

export interface ModelGatewayConfig {
  readonly groqApiKey?: string;
  readonly groqModel?: string;
  readonly geminiApiKey?: string;
  readonly geminiModel?: string;
  readonly timeoutMs: number;
  readonly maxConcurrency: number;
  readonly requestsPerMinute: number;
  readonly tokensPerMinute: number;
  readonly maxAttemptsPerProvider: number;
  readonly circuitFailureThreshold: number;
  readonly circuitResetMs: number;
  readonly cacheTtlMs: number;
  readonly maxCacheEntries: number;
}

export const DEFAULT_MODEL_GATEWAY_CONFIG: ModelGatewayConfig = {
  groqModel: groqAdapter.defaultModel,
  geminiModel: geminiAdapter.defaultModel,
  timeoutMs: 8000,
  maxConcurrency: 4,
  requestsPerMinute: 30,
  tokensPerMinute: 12_000,
  maxAttemptsPerProvider: 2,
  circuitFailureThreshold: 3,
  circuitResetMs: 30_000,
  cacheTtlMs: 60_000,
  maxCacheEntries: 200,
};

export function modelGatewayConfigFromEnvironment(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): ModelGatewayConfig {
  const positive = (key: string, fallback: number): number => {
    const raw = env[key];
    const value = raw === undefined ? Number.NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL || DEFAULT_MODEL_GATEWAY_CONFIG.groqModel,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || DEFAULT_MODEL_GATEWAY_CONFIG.geminiModel,
    timeoutMs: positive('MODEL_GATEWAY_TIMEOUT_MS', DEFAULT_MODEL_GATEWAY_CONFIG.timeoutMs),
    maxConcurrency: positive(
      'MODEL_GATEWAY_MAX_CONCURRENCY',
      DEFAULT_MODEL_GATEWAY_CONFIG.maxConcurrency,
    ),
    requestsPerMinute: positive(
      'MODEL_GATEWAY_RPM',
      DEFAULT_MODEL_GATEWAY_CONFIG.requestsPerMinute,
    ),
    tokensPerMinute: positive(
      'MODEL_GATEWAY_TPM',
      DEFAULT_MODEL_GATEWAY_CONFIG.tokensPerMinute,
    ),
    maxAttemptsPerProvider: positive(
      'MODEL_GATEWAY_MAX_ATTEMPTS',
      DEFAULT_MODEL_GATEWAY_CONFIG.maxAttemptsPerProvider,
    ),
    circuitFailureThreshold: positive(
      'MODEL_GATEWAY_CIRCUIT_THRESHOLD',
      DEFAULT_MODEL_GATEWAY_CONFIG.circuitFailureThreshold,
    ),
    circuitResetMs: positive(
      'MODEL_GATEWAY_CIRCUIT_RESET_MS',
      DEFAULT_MODEL_GATEWAY_CONFIG.circuitResetMs,
    ),
    cacheTtlMs: positive('MODEL_GATEWAY_CACHE_TTL_MS', DEFAULT_MODEL_GATEWAY_CONFIG.cacheTtlMs),
    maxCacheEntries: positive(
      'MODEL_GATEWAY_MAX_CACHE_ENTRIES',
      DEFAULT_MODEL_GATEWAY_CONFIG.maxCacheEntries,
    ),
  };
}

export interface ModelGatewayLogger {
  info(message: string, detail?: Record<string, unknown>): void;
  warn(message: string, detail?: Record<string, unknown>): void;
}

export interface ModelGatewayDeps {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly logger?: ModelGatewayLogger;
  readonly adapters?: readonly ProviderAdapter[];
}

/** Per-provider rolling-window budget. */
class Budget {
  private requests: number[] = [];
  private tokens: Array<{ at: number; amount: number }> = [];
  private readonly rpm: number;
  private readonly tpm: number;

  constructor(rpm: number, tpm: number) {
    this.rpm = rpm;
    this.tpm = tpm;
  }

  canSpend(now: number, estimatedTokens: number): boolean {
    this.prune(now);
    if (this.requests.length >= this.rpm) return false;
    const tokenTotal = this.tokens.reduce((sum, entry) => sum + entry.amount, 0);
    return tokenTotal + estimatedTokens <= this.tpm;
  }

  spend(now: number, estimatedTokens: number): void {
    this.requests.push(now);
    this.tokens.push({ at: now, amount: estimatedTokens });
  }

  private prune(now: number): void {
    const cutoff = now - 60_000;
    this.requests = this.requests.filter((at) => at > cutoff);
    this.tokens = this.tokens.filter((entry) => entry.at > cutoff);
  }
}

interface CircuitState {
  failures: number;
  openUntil: number;
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  async use<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function estimateTokens(text: string): number {
  // Rough but deterministic: four characters per token, floor of one.
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  return JSON.parse(fenced.trim());
}

function errorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error) return error.name;
  return 'unknown error';
}

/**
 * Server-side model gateway. It never mutates canonical game state: the caller
 * validates the returned typed value and routes it through GameSession.
 *
 * Routing order is deterministic per task. Every provider is wrapped by a
 * rolling RPM/TPM budget, a concurrency semaphore, a two-failure retry policy, a
 * circuit breaker and a bounded response cache. When nothing healthy remains,
 * the request's deterministic fallback is returned so gameplay never stalls.
 */
export class ModelGateway {
  private readonly config: ModelGatewayConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: ModelGatewayLogger;
  private readonly adapters: readonly ProviderAdapter[];
  private readonly semaphore: Semaphore;
  private readonly budgets = new Map<ProviderName, Budget>();
  private readonly circuits = new Map<ProviderName, CircuitState>();
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<ModelResponse<unknown>>>();
  private readonly metrics = {
    requests: 0,
    successes: 0,
    failures: 0,
    fallbacks: 0,
    cacheHits: 0,
    totalLatencyMs: 0,
    byTask: {} as Record<string, { requests: number; fallbacks: number }>,
    failureCategories: {} as Record<string, number>,
  };

  constructor(
    config: ModelGatewayConfig = DEFAULT_MODEL_GATEWAY_CONFIG,
    deps: ModelGatewayDeps = {},
  ) {
    this.config = config;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.logger = deps.logger ?? { info: () => undefined, warn: () => undefined };
    this.adapters = deps.adapters ?? [groqAdapter, geminiAdapter];
    this.semaphore = new Semaphore(Math.max(1, config.maxConcurrency));
    this.budgets.set('groq', new Budget(config.requestsPerMinute, config.tokensPerMinute));
    this.budgets.set('gemini', new Budget(config.requestsPerMinute, config.tokensPerMinute));
  }

  /** Providers are only attempted when a key is configured. */
  availableProviders(): readonly ProviderName[] {
    return this.adapters
      .filter((adapter) =>
        adapter.name === 'groq'
          ? adapter.isConfigured(this.config.groqApiKey)
          : adapter.isConfigured(this.config.geminiApiKey),
      )
      .map((adapter) => adapter.name);
  }

  async request<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    this.metrics.requests += 1;
    const taskMetrics = this.metrics.byTask[request.task] ?? { requests: 0, fallbacks: 0 };
    taskMetrics.requests += 1;
    this.metrics.byTask[request.task] = taskMetrics;
    const requestStarted = this.now();
    const cacheKey = request.cacheKey ?? stableHash(`${request.task}|${request.system}|${request.prompt}`);
    const cached = this.readCache(cacheKey);
    if (cached !== null) {
      this.metrics.cacheHits += 1;
      this.metrics.totalLatencyMs += this.now() - requestStarted;
      return {
        provider: 'fallback',
        model: 'cache',
        value: request.schema.parse(cached),
        requestId: request.requestId,
        fallback: false,
        attempts: 0,
        cacheHit: true,
      };
    }

    const dedupeKey = `${request.sessionId}|${request.requestId}`;
    const pending = this.inFlight.get(dedupeKey);
    if (pending) return (await pending) as ModelResponse<T>;

    const work = this.semaphore.use(() => this.execute(request, cacheKey));
    this.inFlight.set(dedupeKey, work as Promise<ModelResponse<unknown>>);
    try {
      const result = await work;
      this.metrics.totalLatencyMs += this.now() - requestStarted;
      if (result.fallback) {
        this.metrics.fallbacks += 1;
        taskMetrics.fallbacks += 1;
      } else {
        this.metrics.successes += 1;
      }
      return result;
    } finally {
      this.inFlight.delete(dedupeKey);
    }
  }

  private async execute<T>(request: ModelRequest<T>, cacheKey: string): Promise<ModelResponse<T>> {
    const order: ProviderName[] =
      request.task === 'echo_analysis' ? ['gemini', 'groq'] : ['groq', 'gemini'];
    const estimated = estimateTokens(request.system + request.prompt);
    let attempts = 0;

    for (const name of order) {
      const adapter = this.adapters.find((candidate) => candidate.name === name);
      if (!adapter) continue;
      const apiKey = name === 'groq' ? this.config.groqApiKey : this.config.geminiApiKey;
      if (!adapter.isConfigured(apiKey)) continue;
      const model = name === 'groq' ? this.config.groqModel : this.config.geminiModel;
      if (!model) continue;

      const budget = this.budgets.get(name);
      const circuit = this.circuits.get(name) ?? { failures: 0, openUntil: 0 };
      this.circuits.set(name, circuit);

      const attemptsForProvider = Math.max(1, Math.floor(this.config.maxAttemptsPerProvider));
      let promptForAttempt = request.prompt;
      let attempted = false;
      for (let attempt = 0; attempt < attemptsForProvider; attempt += 1) {
        const now = this.now();
        if (circuit.openUntil > now) break;
        if (budget && !budget.canSpend(now, estimated)) break;
        budget?.spend(now, estimated);
        attempted = true;
        attempts += 1;

        const controller = new AbortController();
        const timeoutMs = request.timeoutMs ?? this.config.timeoutMs;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const result = await adapter.call({
            system: request.system,
            prompt: promptForAttempt,
            model,
            apiKey: apiKey as string,
            timeoutMs,
            fetchImpl: this.fetchImpl,
            signal: controller.signal,
          });
          const value = request.schema.parse(extractJson(result.text));
          this.writeCache(cacheKey, value);
          circuit.failures = 0;
          this.logger.info('model request succeeded', {
            provider: name,
            task: request.task,
            requestId: request.requestId,
            attempts,
          });
          return {
            provider: name,
            model: result.model,
            value,
            requestId: request.requestId,
            fallback: false,
            attempts,
            cacheHit: false,
          };
        } catch (error) {
          this.metrics.failures += 1;
          const category = classifyFailure(error);
          this.metrics.failureCategories[category] = (this.metrics.failureCategories[category] ?? 0) + 1;
          const providerFailure = error instanceof ProviderError;
          const retryable = providerFailure ? error.retryable : true;
          const retryAfter = providerFailure ? error.retryAfterMs : null;
          this.logger.warn('model provider attempt failed', {
            provider: name,
            task: request.task,
            requestId: request.requestId,
            attempt: attempt + 1,
            status: providerFailure ? error.status : null,
            reason: errorMessage(error),
          });
          if (attempt + 1 >= attemptsForProvider || !retryable) break;
          if (!providerFailure) {
            promptForAttempt =
              `${request.prompt}\n\nYour previous reply failed validation (${errorMessage(error)}). ` +
              'Return only valid JSON matching the requested schema, with no prose or markdown.';
          }
          await this.sleep(retryAfter ?? Math.min(1000, 150 * 2 ** attempt));
        } finally {
          clearTimeout(timer);
        }
      }

      // A provider that exhausts its attempts without success contributes one
      // failure to the circuit; the other provider still gets a chance. Budget
      // and circuit skips are not failures.
      if (!attempted) continue;
      circuit.failures += 1;
      if (circuit.failures >= this.config.circuitFailureThreshold) {
        circuit.openUntil = this.now() + this.config.circuitResetMs;
        this.logger.warn('model provider circuit opened', {
          provider: name,
          task: request.task,
          requestId: request.requestId,
        });
      }
    }

    const fallback = request.schema.parse(request.fallback());
    this.logger.warn('model gateway used deterministic fallback', {
      task: request.task,
      requestId: request.requestId,
      attempts,
      configuredProviders: this.availableProviders(),
    });
    return {
      provider: 'fallback',
      model: 'deterministic',
      value: fallback,
      requestId: request.requestId,
      fallback: true,
      attempts,
      cacheHit: false,
    };
  }

  private readCache(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    // Refresh LRU position.
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  private writeCache(key: string, value: unknown): void {
    this.cache.set(key, { value, expiresAt: this.now() + this.config.cacheTtlMs });
    while (this.cache.size > this.config.maxCacheEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /** Test/diagnostic snapshot; never exposes keys or prompt text. */
  diagnostics(): {
    readonly configuredProviders: readonly ProviderName[];
    readonly openCircuits: readonly ProviderName[];
    readonly cacheEntries: number;
    readonly requests: number;
    readonly successes: number;
    readonly failures: number;
    readonly fallbacks: number;
    readonly cacheHits: number;
    readonly averageLatencyMs: number;
    readonly byTask: Readonly<Record<string, { requests: number; fallbacks: number }>>;
    readonly failureCategories: Readonly<Record<string, number>>;
  } {
    const now = this.now();
    return {
      configuredProviders: this.availableProviders(),
      openCircuits: [...this.circuits.entries()]
        .filter(([, state]) => state.openUntil > now)
        .map(([name]) => name),
      cacheEntries: this.cache.size,
      requests: this.metrics.requests,
      successes: this.metrics.successes,
      failures: this.metrics.failures,
      fallbacks: this.metrics.fallbacks,
      cacheHits: this.metrics.cacheHits,
      averageLatencyMs: this.metrics.requests === 0 ? 0 : Math.round(this.metrics.totalLatencyMs / this.metrics.requests),
      byTask: { ...this.metrics.byTask },
      failureCategories: { ...this.metrics.failureCategories },
    };
  }
}

/** Sanitized failure class for diagnostics. Never includes provider text or keys. */
function classifyFailure(error: unknown): string {
  if (error instanceof z.ZodError) return 'invalid_response';
  if (error instanceof ProviderError) {
    if (error.status === 401 || error.status === 403) return 'authentication';
    if (error.status === 429) return 'rate_limit';
    if (error.status !== null && error.status >= 500) return 'provider_unavailable';
    if (error.status === 408) return 'timeout';
    return 'provider_error';
  }
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}
