import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { makeTestEnv } from './helpers/env.js';

const testEnv = makeTestEnv({
  DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:59999/not_used',
});

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
      expect(response.json()).toMatchObject({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
        },
      });
      expect(response.json().error.requestId).not.toBe('test-request-id');
    } finally {
      await app.close();
    }
  });
});
