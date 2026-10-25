import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { makeTestEnv } from './helpers/env.js';

const testEnv = makeTestEnv({
  DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:59999/not_used',
});

describe('GET /api/health', () => {
  it('returns liveness without requiring PostgreSQL', async () => {
    const app = await buildApp({ env: testEnv, logger: false });

    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'ok',
        service: 'mernpress-api',
      });
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    } finally {
      await app.close();
    }
  });
});
