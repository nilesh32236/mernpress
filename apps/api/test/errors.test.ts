import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Env } from '../src/config/env.js';

const testEnv: Env = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 4000,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:59999/not_used',
  CORS_ORIGINS: ['http://localhost:5173'],
};

describe('error envelope', () => {
  it('returns a stable 404 envelope with the request id', async () => {
    const app = await buildApp({ env: testEnv, logger: false });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/does-not-exist',
        headers: { 'x-request-id': 'test-request-id' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: 'test-request-id',
        },
      });
    } finally {
      await app.close();
    }
  });
});
