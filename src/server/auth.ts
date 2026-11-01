import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AuthClaims {
  readonly playerId: string;
  /** Unix epoch milliseconds. */
  readonly exp: number;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Issues a compact, HMAC-signed bearer token. The player id is the only
 * identity claim; everything else (ownership, branches) is derived from stored
 * session rows. Tokens are stateless but short-lived.
 */
export function signToken(
  playerId: string,
  secret: string,
  ttlMs: number,
  now: () => number = Date.now,
): { token: string; expiresAt: string } {
  const exp = now() + ttlMs;
  const payload = base64Url(JSON.stringify({ playerId, exp }));
  const token = `${payload}.${signature(payload, secret)}`;
  return { token, expiresAt: new Date(exp).toISOString() };
}

/** Returns null for malformed, tampered or expired tokens. */
export function verifyToken(
  token: string,
  secret: string,
  now: () => number = Date.now,
): AuthClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, provided] = parts;
  const expected = signature(payload!, secret);
  if (provided!.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(provided!), Buffer.from(expected))) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  const { playerId, exp } = claims as Record<string, unknown>;
  if (typeof playerId !== 'string' || playerId.length === 0) return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= now()) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(playerId)) return null;
  return { playerId, exp };
}

/** Per-identity sliding window limiter. Bounded to avoid unbounded memory. */
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(limit: number, windowMs = 60_000, maxKeys = 10_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  allow(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const entries = (this.buckets.get(key) ?? []).filter((at) => at > cutoff);
    if (entries.length >= this.limit) {
      this.buckets.set(key, entries);
      return false;
    }
    entries.push(now);
    this.buckets.set(key, entries);
    if (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
    return true;
  }
}
