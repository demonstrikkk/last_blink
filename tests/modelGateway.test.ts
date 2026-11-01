import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_MODEL_GATEWAY_CONFIG,
  ModelGateway,
  type ModelGatewayConfig,
  type ModelGatewayLogger,
} from '../src/services/modelGateway.js';
import {
  ProviderError,
  type ProviderAdapter,
  type ProviderCallArgs,
  type ProviderName,
  type ProviderResult,
} from '../src/services/providers/types.js';

const schema = z.object({ line: z.string().min(1) });
type Line = z.infer<typeof schema>;

interface FakeAdapter extends ProviderAdapter {
  readonly calls: Array<ProviderCallArgs>;
}

function fakeAdapter(
  name: ProviderName,
  handler: (args: ProviderCallArgs, call: number) => Promise<ProviderResult>,
): FakeAdapter {
  const calls: ProviderCallArgs[] = [];
  return {
    name,
    defaultModel: `${name}-test`,
    calls,
    isConfigured: (key) => typeof key === 'string' && key.length > 0,
    call: async (args) => {
      calls.push(args);
      return handler(args, calls.length);
    },
  };
}

function config(overrides: Partial<ModelGatewayConfig> = {}): ModelGatewayConfig {
  return {
    ...DEFAULT_MODEL_GATEWAY_CONFIG,
    groqApiKey: 'groq-secret-key',
    geminiApiKey: 'gemini-secret-key',
    groqModel: 'groq-test',
    geminiModel: 'gemini-test',
    timeoutMs: 1000,
    maxConcurrency: 2,
    requestsPerMinute: 100,
    tokensPerMinute: 100_000,
    maxAttemptsPerProvider: 2,
    circuitFailureThreshold: 3,
    circuitResetMs: 10_000,
    cacheTtlMs: 60_000,
    maxCacheEntries: 10,
    ...overrides,
  };
}

function captureLogger(): { logger: ModelGatewayLogger; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info: (message, detail) => lines.push(JSON.stringify({ message, detail })),
      warn: (message, detail) => lines.push(JSON.stringify({ message, detail })),
    },
  };
}

const request = <T>(schemaType: z.ZodType<T>, fallback: () => T) => ({
  task: 'npc_dialogue' as const,
  system: 'system',
  prompt: 'prompt',
  schema: schemaType,
  sessionId: 'ses_test',
  requestId: 'req_test',
  fallback,
});

describe('model gateway', () => {
  it('uses the deterministic fallback when no provider is configured', async () => {
    const { logger, lines } = captureLogger();
    const gateway = new ModelGateway(config({ groqApiKey: undefined, geminiApiKey: undefined }), {
      adapters: [],
      logger,
    });
    const response = await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(response.provider).toBe('fallback');
    expect(response.fallback).toBe(true);
    expect(response.value.line).toBe('fallback');
    expect(lines.join(' ')).toContain('deterministic fallback');
    expect(lines.join(' ')).not.toContain('secret');
  });

  it('routes dialogue to Groq and analysis to Gemini', async () => {
    const groq = fakeAdapter('groq', async () => ({ text: '{"line":"groq"}', model: 'g' }));
    const gemini = fakeAdapter('gemini', async () => ({ text: '{"line":"gemini"}', model: 'm' }));
    const gateway = new ModelGateway(config(), { adapters: [groq, gemini] });

    const dialogue = await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(dialogue.provider).toBe('groq');
    expect(dialogue.value.line).toBe('groq');
    expect(dialogue.cacheHit).toBe(false);

    const analysis = await gateway.request<Line>({
      ...request(schema, () => ({ line: 'fallback' })),
      task: 'echo_analysis',
      prompt: 'different prompt',
      requestId: 'req_analysis',
    });
    expect(analysis.provider).toBe('gemini');
    expect(gemini.calls.length).toBe(1);
  });

  it('falls back to the second provider when the first fails', async () => {
    const groq = fakeAdapter('groq', async () => {
      throw new ProviderError('groq', 'server error', { status: 500, retryable: false });
    });
    const gemini = fakeAdapter('gemini', async () => ({ text: '{"line":"second"}', model: 'm' }));
    const gateway = new ModelGateway(config(), {
      adapters: [groq, gemini],
      sleep: async () => undefined,
    });
    const response = await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(response.provider).toBe('gemini');
    expect(response.value.line).toBe('second');
  });

  it('honours Retry-After and retries a transient failure', async () => {
    const sleeps: number[] = [];
    const groq = fakeAdapter('groq', async (_args, call) => {
      if (call === 1) {
        throw new ProviderError('groq', 'rate limited', {
          status: 429,
          retryAfterMs: 1500,
          retryable: true,
        });
      }
      return { text: '{"line":"recovered"}', model: 'g' };
    });
    const gateway = new ModelGateway(config(), {
      adapters: [groq],
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const response = await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(sleeps).toEqual([1500]);
    expect(response.attempts).toBe(2);
    expect(response.value.line).toBe('recovered');
  });

  it('repairs invalid JSON with one schema-guided retry', async () => {
    const groq = fakeAdapter('groq', async (_args, call) =>
      call === 1
        ? { text: 'not json', model: 'g' }
        : { text: `{"line":"fixed"}`, model: 'g' },
    );
    const gateway = new ModelGateway(config(), {
      adapters: [groq],
      sleep: async () => undefined,
    });
    const response = await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(response.value.line).toBe('fixed');
    expect(groq.calls.length).toBe(2);
    expect(groq.calls[1]?.prompt).toContain('valid JSON');
  });

  it('records sanitized failure categories without exposing provider text or keys', async () => {
    const groq = fakeAdapter('groq', async () => {
      throw new ProviderError('groq', 'invalid api key groq-secret-key', {
        status: 401,
        retryable: false,
      });
    });
    const gateway = new ModelGateway(config({ maxAttemptsPerProvider: 1 }), {
      adapters: [groq],
      sleep: async () => undefined,
    });
    const response = await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(response.fallback).toBe(true);
    const diagnostics = gateway.diagnostics();
    expect(diagnostics.failureCategories.authentication).toBe(1);
    expect(JSON.stringify(diagnostics)).not.toContain('groq-secret-key');
    expect(JSON.stringify(diagnostics)).not.toContain('invalid api key');
  });

  it('caches identical requests and deduplicates concurrent ones', async () => {
    const deferred: { resolve: ((value: ProviderResult) => void) | null } = { resolve: null };
    const groq = fakeAdapter('groq', async () => {
      if (groq.calls.length === 1) {
        return new Promise<ProviderResult>((resolve) => {
          deferred.resolve = resolve;
        });
      }
      return { text: '{"line":"second"}', model: 'g' };
    });
    const gateway = new ModelGateway(config(), { adapters: [groq] });
    const firstRequest = request(schema, () => ({ line: 'fallback' }));
    const pending = gateway.request<Line>(firstRequest);
    // Give the first call time to reach the adapter before the duplicate.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const duplicate = gateway.request<Line>(firstRequest);
    await new Promise((resolve) => setTimeout(resolve, 10));
    deferred.resolve?.({ text: '{"line":"first"}', model: 'g' });
    const [a, b] = await Promise.all([pending, duplicate]);
    expect(groq.calls.length).toBe(1);
    expect(a.value.line).toBe('first');
    expect(b.value.line).toBe('first');

    const cached = await gateway.request<Line>(firstRequest);
    expect(cached.cacheHit).toBe(true);
    expect(groq.calls.length).toBe(1);
  });

  it('opens a circuit after repeated failures and later resets it', async () => {
    let now = 0;
    let healthy = false;
    const groq = fakeAdapter('groq', async () => {
      if (!healthy) {
        throw new ProviderError('groq', 'down', { status: 503, retryable: false });
      }
      return { text: '{"line":"back"}', model: 'g' };
    });
    const gateway = new ModelGateway(
      config({ circuitFailureThreshold: 1, maxAttemptsPerProvider: 1, circuitResetMs: 5000 }),
      { adapters: [groq], now: () => now, sleep: async () => undefined },
    );

    await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(gateway.diagnostics().openCircuits).toContain('groq');

    const skipped = await gateway.request<Line>({
      ...request(schema, () => ({ line: 'fallback' })),
      prompt: 'another prompt',
      requestId: 'req_open',
    });
    expect(groq.calls.length).toBe(1);
    expect(skipped.fallback).toBe(true);

    now = 6000;
    healthy = true;
    const recovered = await gateway.request<Line>({
      ...request(schema, () => ({ line: 'fallback' })),
      prompt: 'after reset',
      requestId: 'req_reset',
    });
    expect(recovered.provider).toBe('groq');
    expect(recovered.value.line).toBe('back');
  });

  it('stops spending once the per-provider RPM budget is exhausted', async () => {
    const groq = fakeAdapter('groq', async () => ({ text: '{"line":"ok"}', model: 'g' }));
    const gemini = fakeAdapter('gemini', async () => ({ text: '{"line":"gm"}', model: 'm' }));
    const gateway = new ModelGateway(
      config({ requestsPerMinute: 1, maxAttemptsPerProvider: 1 }),
      { adapters: [groq, gemini] },
    );
    const first = await gateway.request<Line>(request(schema, () => ({ line: 'fallback' })));
    expect(first.provider).toBe('groq');
    // A different prompt bypasses the cache but Groq's budget is spent, so the
    // request must route to the other provider rather than exceed the limit.
    const second = await gateway.request<Line>({
      ...request(schema, () => ({ line: 'fallback' })),
      prompt: 'second prompt',
      requestId: 'req_second',
    });
    expect(groq.calls.length).toBe(1);
    expect(second.provider).toBe('gemini');
  });

  it('never logs API keys or prompt contents', async () => {
    const { logger, lines } = captureLogger();
    const groq = fakeAdapter('groq', async () => {
      throw new ProviderError('groq', 'down', { status: 500, retryable: false });
    });
    const gateway = new ModelGateway(config(), {
      adapters: [groq],
      logger,
      sleep: async () => undefined,
    });
    await gateway.request<Line>({
      ...request(schema, () => ({ line: 'secret-fallback' })),
      prompt: 'THE PLAYER SECRET PROMPT',
    });
    const output = lines.join('\n');
    expect(output).not.toContain('groq-secret-key');
    expect(output).not.toContain('THE PLAYER SECRET PROMPT');
  });
});
