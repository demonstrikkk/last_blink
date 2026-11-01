import {
  ProviderError,
  retryAfterMsFromHeader,
  type ProviderAdapter,
  type ProviderCallArgs,
  type ProviderResult,
} from './types.ts';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqPayload {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Official Groq OpenAI-compatible chat completions adapter. */
export const groqAdapter: ProviderAdapter = {
  name: 'groq',
  defaultModel: 'qwen/qwen3.8-27b',

  isConfigured(key) {
    return typeof key === 'string' && key.trim().length > 0;
  },

  async call(args: ProviderCallArgs): Promise<ProviderResult> {
    let response: Response;
    try {
      response = await args.fetchImpl(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify({
          model: args.model,
          temperature: 0,
          max_tokens: 700,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: args.prompt },
          ],
        }),
        signal: args.signal,
      } as RequestInit);
    } catch (error) {
      throw new ProviderError(
        'groq',
        error instanceof Error && error.name === 'AbortError'
          ? 'Groq request timed out'
          : 'Groq request failed',
        { retryable: true },
      );
    }

    if (!response.ok) {
      throw new ProviderError('groq', `Groq HTTP ${response.status}`, {
        status: response.status,
        retryAfterMs: retryAfterMsFromHeader(response.headers.get('retry-after')),
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    let payload: GroqPayload;
    try {
      payload = (await response.json()) as GroqPayload;
    } catch {
      throw new ProviderError('groq', 'Groq returned invalid JSON transport', { retryable: true });
    }
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new ProviderError('groq', 'Groq returned an empty completion', { retryable: false });
    }
    return { text, model: args.model };
  },
};
