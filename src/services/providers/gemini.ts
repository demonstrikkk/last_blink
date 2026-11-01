import {
  ProviderError,
  retryAfterMsFromHeader,
  type ProviderAdapter,
  type ProviderCallArgs,
  type ProviderResult,
} from './types.ts';

const GEMINI_HOST = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPayload {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Official Gemini generateContent adapter. The API key travels in the
 * `x-goog-api-key` header, never in a query string, so it cannot leak through
 * URL logging or error diagnostics.
 */
export const geminiAdapter: ProviderAdapter = {
  name: 'gemini',
  defaultModel: 'gemini-3.8-flash',

  isConfigured(key) {
    return typeof key === 'string' && key.trim().length > 0;
  },

  async call(args: ProviderCallArgs): Promise<ProviderResult> {
    const endpoint = `${GEMINI_HOST}/${encodeURIComponent(args.model)}:generateContent`;
    let response: Response;
    try {
      response = await args.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': args.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 700,
            responseMimeType: 'application/json',
          },
        }),
        signal: args.signal,
      } as RequestInit);
    } catch (error) {
      throw new ProviderError(
        'gemini',
        error instanceof Error && error.name === 'AbortError'
          ? 'Gemini request timed out'
          : 'Gemini request failed',
        { retryable: true },
      );
    }

    if (!response.ok) {
      throw new ProviderError('gemini', `Gemini HTTP ${response.status}`, {
        status: response.status,
        retryAfterMs: retryAfterMsFromHeader(response.headers.get('retry-after')),
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    let payload: GeminiPayload;
    try {
      payload = (await response.json()) as GeminiPayload;
    } catch {
      throw new ProviderError('gemini', 'Gemini returned invalid JSON transport', { retryable: true });
    }
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new ProviderError('gemini', 'Gemini returned an empty completion', { retryable: false });
    }
    return { text, model: args.model };
  },
};
