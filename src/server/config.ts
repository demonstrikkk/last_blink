/**
 * Server configuration. Every value is validated at startup so a partially
 * configured deployment fails loudly instead of silently running in a weaker
 * mode. Secrets are never exposed to the browser bundle: only this server
 * process reads them.
 */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly sessionSecret: string;
  readonly databaseUrl?: string;
  /** Filesystem path to the Yugabyte root CA (never inline the PEM here). */
  readonly databaseSslCaPath?: string;
  readonly corsOrigins: readonly string[];
  readonly maxBodyBytes: number;
  readonly tokenTtlMs: number;
  readonly rateLimitPerMinute: number;
  readonly trustProxy: boolean;
}

const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return Math.floor(value);
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (production && sessionSecret.trim().length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  }
  if (!production && sessionSecret.trim().length === 0) {
    throw new Error('SESSION_SECRET is required. Copy .env.example to .env and set it.');
  }

  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  if (databaseUrl !== undefined && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a postgresql:// connection string.');
  }

  const corsOrigins = (env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGINS may not contain a wildcard when credentials are supported.');
    }
  }

  return {
    port: positiveInt(env.PORT, 8787, 'PORT'),
    host: env.HOST?.trim() || '127.0.0.1',
    sessionSecret,
    databaseUrl,
    databaseSslCaPath: env.DATABASE_SSL_CA?.trim() || undefined,
    corsOrigins,
    maxBodyBytes: positiveInt(env.MAX_BODY_BYTES, 256 * 1024, 'MAX_BODY_BYTES'),
    tokenTtlMs: positiveInt(env.TOKEN_TTL_MS, 12 * 60 * 60 * 1000, 'TOKEN_TTL_MS'),
    rateLimitPerMinute: positiveInt(env.RATE_LIMIT_PER_MINUTE, 120, 'RATE_LIMIT_PER_MINUTE'),
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
