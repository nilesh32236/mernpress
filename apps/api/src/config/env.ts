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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  HOST: string;
  PORT: number;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  DATABASE_URL: string;
  CORS_ORIGINS: string[];
}

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

  const origins = parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one explicit origin');
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGINS must not contain a wildcard when credentials are enabled');
    }
    try {
      const url = new URL(origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return {
    ...parsed.data,
    CORS_ORIGINS: origins,
  };
}
