import { describe, expect, it } from 'vitest';
import { geminiAdapter } from '../src/services/providers/gemini.js';
import { groqAdapter } from '../src/services/providers/groq.js';
import { ProviderError, retryAfterMsFromHeader } from '../src/services/providers/types.js';

function respond(body: unknown, init: ResponseInit = {}): typeof fetch {
  return (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })) as typeof fetch;
}

const args = (fetchImpl: typeof fetch) => ({
  system: 'system rules',
  prompt: 'prompt text',
  model: 'test-model',
  apiKey: 'super-secret-key',
  timeoutMs: 1000,
  fetchImpl,
  signal: new AbortController().signal,
});

describe('provider adapters', () => {
  it('sends the Groq key in the Authorization header only', async () => {
    let seenUrl = '';
    let seenHeaders: Headers | null = null;
    let seenBody: Record<string, unknown> = {};
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenHeaders = new Headers(init?.headers);
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"line":"ok"}' } }] }), {
        status: 200,
      });
    }) as typeof fetch;

    const result = await groqAdapter.call(args(fetchImpl));
    expect(result.text).toBe('{"line":"ok"}');
    expect(seenUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(seenUrl).not.toContain('super-secret-key');
    expect(seenHeaders!.get('authorization')).toBe('Bearer super-secret-key');
    expect(seenBody.model).toBe('test-model');
    expect(seenBody.temperature).toBe(0);
  });

  it('sends the Gemini key in x-goog-api-key, never in the URL', async () => {
    let seenUrl = '';
    let seenKey: string | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenKey = new Headers(init?.headers).get('x-goog-api-key');
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"line":"ok"}' }] } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await geminiAdapter.call(args(fetchImpl));
    expect(result.text).toBe('{"line":"ok"}');
    expect(seenUrl).toContain('/models/test-model:generateContent');
    expect(seenUrl).not.toContain('super-secret-key');
    expect(seenKey).toBe('super-secret-key');
  });

  it('maps 429 responses to retryable ProviderErrors with Retry-After', async () => {
    const fetchImpl = respond({ error: 'rate limited' }, {
      status: 429,
      headers: { 'retry-after': '2' },
    });
    await expect(groqAdapter.call(args(fetchImpl))).rejects.toMatchObject({
      name: 'ProviderError',
      status: 429,
      retryAfterMs: 2000,
      retryable: true,
    } satisfies Partial<ProviderError>);
  });

  it('marks client errors as non-retryable and never echoes the key', async () => {
    const fetchImpl = respond({ error: 'bad request' }, { status: 400 });
    try {
      await geminiAdapter.call(args(fetchImpl));
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      expect(providerError.retryable).toBe(false);
      expect(providerError.message).not.toContain('super-secret-key');
    }
  });

  it('rejects empty completions', async () => {
    const fetchImpl = respond({ choices: [{ message: { content: '' } }] });
    await expect(groqAdapter.call(args(fetchImpl))).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('rejects invalid JSON transport', async () => {
    const fetchImpl = respond('not-json');
    await expect(groqAdapter.call(args(fetchImpl))).rejects.toMatchObject({ retryable: true });
  });

  it('parses Retry-After seconds and dates', () => {
    expect(retryAfterMsFromHeader('3')).toBe(3000);
    expect(retryAfterMsFromHeader(null)).toBeNull();
    expect(retryAfterMsFromHeader('not-a-date')).toBeNull();
    const future = new Date(Date.now() + 4000).toUTCString();
    expect(retryAfterMsFromHeader(future)).toBeGreaterThan(0);
  });
});
