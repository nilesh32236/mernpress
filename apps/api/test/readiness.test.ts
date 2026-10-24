import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv, type Env } from '../src/config/env.js';

function envWithDatabaseUrl(databaseUrl: string): Env {
  return {
    ...loadEnv(),
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
  };
}

describe('GET /api/ready', () => {
  it('returns 200 when PostgreSQL is reachable', async () => {
    const env = envWithDatabaseUrl(loadEnv().DATABASE_URL);
    const app = await buildApp({ env, logger: false });

    try {
      const response = await app.inject({ method: 'GET', url: '/api/ready' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ready',
        checks: { database: 'ok' },
      });
    } finally {
      await app.close();
    }
  });

  it('returns 503 while the process stays alive when PostgreSQL is unreachable', async () => {
    const env = envWithDatabaseUrl(
      'postgresql://invalid:invalid@127.0.0.1:59999/mernpress_unreachable',
    );
    const app = await buildApp({ env, logger: false });

    try {
      const ready = await app.inject({ method: 'GET', url: '/api/ready' });
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({
        status: 'not_ready',
        checks: { database: 'unavailable' },
      });

      const health = await app.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
