import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { makeTestEnv, testDatabaseUrl } from './helpers/env.js';

describe('GET /api/ready', () => {
  it('returns 200 when PostgreSQL is reachable', async () => {
    const app = await buildApp({
      env: makeTestEnv({ DATABASE_URL: testDatabaseUrl }),
      logger: false,
    });

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
    const app = await buildApp({
      env: makeTestEnv({
        DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:59999/mernpress_unreachable',
      }),
      logger: false,
    });

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
