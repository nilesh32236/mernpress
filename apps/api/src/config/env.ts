import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

/**
 * Loads the nearest .env walking up from the current working directory. Existing
 * process environment variables win because dotenv does not override by default.
 */
function loadLocalEnv(): void {
  let current = path.resolve(process.cwd());

  for (;;) {
    const candidate = path.join(current, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate, quiet: true });
      return;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}

loadLocalEnv();

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  HOST: z.string().min(1, 'HOST must not be empty').default('127.0.0.1'),
  PORT: z.coerce
    .number()
    .int('PORT must be an integer')
    .min(1, 'PORT must be between 1 and 65535')
    .max(65535, 'PORT must be between 1 and 65535')
    .default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required; copy .env.example to .env and configure PostgreSQL')
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'postgresql:' || url.protocol === 'postgres:';
      } catch {
        return false;
      }
    }, 'DATABASE_URL must be a valid postgresql:// connection URL'),
  CORS_ORIGINS: z.string().optional(),
  /** Optional release manifest endpoint for the Updates screen. */
  UPDATE_MANIFEST_URL: z.string().url().optional(),
  /** Optional overrides for the dashboard Events and News feeds. */
  EVENTS_API_URL: z.string().url().optional(),
  NEWS_FEED_URL: z.string().url().optional(),
  AUTH_HASH_PEPPER: z
    .string()
    .min(32, 'AUTH_HASH_PEPPER must be at least 32 characters')
    .optional(),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(43_200).default(480),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1_440).default(30),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
  /// Absolute path of the media storage root (Phase 6). Files are served only
  /// through the API; the directory must not be exposed statically.
  MEDIA_STORAGE_DIR: z.string().min(1, 'MEDIA_STORAGE_DIR must not be empty').default('var/media'),
  /// First-publish scheduling sweeper (P8-04, ADR 0008 §4). Disable in tests
  /// or when running multiple unsynchronized instances.
  SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = {
  NODE_ENV: 'development' | 'test' | 'production';
  HOST: string;
  PORT: number;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  DATABASE_URL: string;
  AUTH_HASH_PEPPER: string;
  CORS_ORIGINS: string[];
  TRUST_PROXY: boolean;
  SESSION_TTL_MINUTES: number;
  SESSION_IDLE_MINUTES: number;
  LOGIN_RATE_LIMIT_MAX: number;
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: number;
  MEDIA_STORAGE_DIR: string;
  SCHEDULER_ENABLED: boolean;
  UPDATE_MANIFEST_URL: string | undefined;
  EVENTS_API_URL: string | undefined;
  NEWS_FEED_URL: string | undefined;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = rawEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and set the values.`,
    );
  }

  if (parsed.data.SESSION_IDLE_MINUTES > parsed.data.SESSION_TTL_MINUTES) {
    throw new Error('SESSION_IDLE_MINUTES must not exceed SESSION_TTL_MINUTES');
  }

  const isProduction = parsed.data.NODE_ENV === 'production';

  if (isProduction && !parsed.data.CORS_ORIGINS) {
    throw new Error('CORS_ORIGINS is required in production');
  }

  if (
    isProduction &&
    (!parsed.data.AUTH_HASH_PEPPER || /change-me|replace/i.test(parsed.data.AUTH_HASH_PEPPER))
  ) {
    throw new Error('AUTH_HASH_PEPPER must be set to a real secret in production');
  }

  const hashPepper = parsed.data.AUTH_HASH_PEPPER ?? 'dev-only-auth-hash-pepper-not-for-production';
  const origins = (parsed.data.CORS_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one explicit origin');
  }

  const normalizedOrigins: string[] = [];
  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGINS must not contain a wildcard when credentials are enabled');
    }

    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`CORS_ORIGINS contains an unsupported origin: ${origin}`);
    }
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error(
        'CORS_ORIGINS origins must not include a path, query, fragment or credentials',
      );
    }
    if (isProduction && url.protocol !== 'https:') {
      throw new Error('production origins must use HTTPS');
    }
    if (isProduction && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      throw new Error('production origins must not be loopback addresses');
    }

    const normalized = url.origin;
    if (!normalizedOrigins.includes(normalized)) {
      normalizedOrigins.push(normalized);
    }
  }

  const storageDir = path.isAbsolute(parsed.data.MEDIA_STORAGE_DIR)
    ? parsed.data.MEDIA_STORAGE_DIR
    : path.resolve(process.cwd(), parsed.data.MEDIA_STORAGE_DIR);

  return {
    ...parsed.data,
    AUTH_HASH_PEPPER: hashPepper,
    CORS_ORIGINS: normalizedOrigins,
    MEDIA_STORAGE_DIR: storageDir,
    UPDATE_MANIFEST_URL: parsed.data.UPDATE_MANIFEST_URL,
    EVENTS_API_URL: parsed.data.EVENTS_API_URL,
    NEWS_FEED_URL: parsed.data.NEWS_FEED_URL,
  };
}
