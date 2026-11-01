/**
 * Shared provider contract. Each adapter translates one gateway request into a
 * provider HTTP call and returns raw text; the gateway owns validation, budgets,
 * retries, circuit state and fallback, so providers stay small and testable.
 */

export type ProviderName = 'groq' | 'gemini';

export interface ProviderCallArgs {
  readonly system: string;
  readonly prompt: string;
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl: typeof fetch;
  readonly signal: AbortSignal;
}

export interface ProviderResult {
  readonly text: string;
  readonly model: string;
}

export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  readonly retryable: boolean;

  constructor(
    provider: ProviderName,
    message: string,
    options: { status?: number | null; retryAfterMs?: number | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.retryable = options.retryable ?? true;
  }
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly defaultModel: string;
  isConfigured(key: string | undefined): boolean;
  call(args: ProviderCallArgs): Promise<ProviderResult>;
}

export function retryAfterMsFromHeader(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - Date.now()), 30_000);
  }
  return null;
}
