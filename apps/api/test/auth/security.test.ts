import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { makeTestEnv } from '../helpers/env.js';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  getCsrf,
  loginAs,
  resetAuthTables,
  seedAdmin,
} from '../helpers/auth.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('CSRF and Origin protection', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects login without an allowed Origin', async () => {
    const csrf = await getCsrf(app);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        'x-csrf-token': csrf.token,
        cookie: csrf.cookieHeader,
        'content-type': 'application/json',
      },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } });

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: 'https://evil.example',
        'x-csrf-token': csrf.token,
        cookie: csrf.cookieHeader,
        'content-type': 'application/json',
      },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } });
  });

  it('rejects missing, wrong and mismatched CSRF tokens', async () => {
    const first = await getCsrf(app);
    const second = await getCsrf(app);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: first.cookieHeader,
        'content-type': 'application/json',
      },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toMatchObject({ error: { code: 'CSRF_INVALID' } });

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: ADMIN_ORIGIN,
        'x-csrf-token': 'wrong-token',
        cookie: first.cookieHeader,
        'content-type': 'application/json',
      },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json()).toMatchObject({ error: { code: 'CSRF_INVALID' } });

    const mismatched = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: ADMIN_ORIGIN,
        'x-csrf-token': second.token,
        cookie: first.cookieHeader,
        'content-type': 'application/json',
      },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    expect(mismatched.statusCode).toBe(403);
    expect(mismatched.json()).toMatchObject({ error: { code: 'CSRF_INVALID' } });
  });

  it('rejects oversized, malformed and extra-field request bodies', async () => {
    const csrf = await getCsrf(app);
    const headers = {
      origin: ADMIN_ORIGIN,
      'x-csrf-token': csrf.token,
      cookie: csrf.cookieHeader,
      'content-type': 'application/json',
    };

    const oversized = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: 'x'.repeat(20_000),
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });

    const malformed = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: '{',
    });
    expect(malformed.statusCode).toBe(400);

    const extraField = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: {
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        role: 'administrator',
      },
    });
    expect(extraField.statusCode).toBe(400);
    expect(extraField.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('login rate limiting', () => {
  it('limits repeated failures, records the event and recovers after the window', async () => {
    let current = new Date('2026-10-25T00:00:00.000Z');
    const app = await createTestApp({
      LOGIN_RATE_LIMIT_MAX: 2,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: 15,
      now: () => current,
    });

    try {
      await seedAdmin(app);

      const first = await loginAs(app, ADMIN_USERNAME, 'wrong password');
      const second = await loginAs(app, ADMIN_USERNAME, 'wrong password');
      expect(first.response.statusCode).toBe(401);
      expect(second.response.statusCode).toBe(401);

      const limited = await loginAs(app, ADMIN_USERNAME, 'wrong password');
      expect(limited.response.statusCode).toBe(429);
      expect(limited.response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
      expect(limited.response.headers['retry-after']).toBeDefined();

      // A blocked client can retry indefinitely. The limiter must keep
      // returning 429 without writing one durable audit row per rejection.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const blocked = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
        expect(blocked.response.statusCode).toBe(429);
        expect(blocked.response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
        expect(blocked.response.headers['retry-after']).toBeDefined();
      }

      const audits = await app.database.auditEvent.findMany({
        where: { eventType: 'auth.login.rate_limited' },
      });
      expect(audits.length).toBeGreaterThan(0);
      expect(audits.length).toBeLessThanOrEqual(2);
      for (const audit of audits) {
        const metadata = audit.metadata as { reason?: string; identifierHash?: string };
        expect(metadata.reason).toBe('threshold_reached');
        expect(metadata.identifierHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(metadata)).not.toContain(ADMIN_USERNAME);
      }

      current = new Date(current.getTime() + 16 * 60_000);
      const recovered = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
      expect(recovered.response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('limits a username across different client IPs', async () => {
    const app = await createTestApp({
      LOGIN_RATE_LIMIT_MAX: 2,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: 15,
    });

    try {
      await seedAdmin(app);
      const attemptFrom = (ip: string) =>
        app.auth.login({ username: ADMIN_USERNAME, password: 'wrong password', ip });

      await expect(attemptFrom('10.9.0.1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(attemptFrom('10.9.0.2')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      // Both IP keys are fresh, so only the shared username key can explain this.
      await expect(attemptFrom('10.9.0.3')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    } finally {
      await app.close();
    }
  });

  it('does not add durable rate-limit rows for concurrent blocked retries', async () => {
    const app = await createTestApp({
      LOGIN_RATE_LIMIT_MAX: 2,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: 15,
    });

    try {
      await seedAdmin(app);
      await loginAs(app, ADMIN_USERNAME, 'wrong password');
      await loginAs(app, ADMIN_USERNAME, 'wrong password');

      const before = await app.database.auditEvent.count({
        where: { eventType: 'auth.login.rate_limited' },
      });
      expect(before).toBeGreaterThan(0);

      const blocked = await Promise.all(
        Array.from({ length: 10 }, () => loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD)),
      );

      for (const attempt of blocked) {
        expect(attempt.response.statusCode).toBe(429);
        expect(attempt.response.headers['retry-after']).toBeDefined();
      }

      const after = await app.database.auditEvent.count({
        where: { eventType: 'auth.login.rate_limited' },
      });
      expect(after).toBe(before);
    } finally {
      await app.close();
    }
  });
});

describe('invalid usernames', () => {
  it('are rate limited rather than bypassing the limiter', async () => {
    const app = await createTestApp({
      LOGIN_RATE_LIMIT_MAX: 1,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: 15,
    });

    try {
      await seedAdmin(app);
      const first = await loginAs(app, 'bad username!', 'wrong password');
      const second = await loginAs(app, 'bad username!', 'wrong password');

      expect(first.response.statusCode).toBe(401);
      expect(second.response.statusCode).toBe(429);
      expect(second.response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    } finally {
      await app.close();
    }
  });
});

describe('request IDs', () => {
  it('echoes only canonical UUIDs and replaces arbitrary input', async () => {
    const app = await createTestApp();

    try {
      const uuid = '11111111-2222-4333-8444-555555555555';
      const valid = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-request-id': uuid },
      });
      expect(valid.headers['x-request-id']).toBe(uuid);

      const oversized = 'not-a-uuid'.repeat(100);
      const invalid = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-request-id': oversized },
      });
      expect(invalid.headers['x-request-id']).not.toBe(oversized);
      expect(invalid.headers['x-request-id']).toMatch(UUID_PATTERN);
    } finally {
      await app.close();
    }
  });
});

describe('log redaction', () => {
  it('does not log passwords, session cookies or CSRF tokens', async () => {
    let logs = '';
    const app = await buildApp({
      env: makeTestEnv({ LOG_LEVEL: 'info' }),
      logger: true,
      loggerStream: {
        write(message: string) {
          logs += message;
        },
      },
    });

    try {
      await resetAuthTables(app);
      await seedAdmin(app);

      const uniquePassword = 'Unique-Log-Password-2026!';
      const failed = await loginAs(app, ADMIN_USERNAME, uniquePassword);
      expect(failed.response.statusCode).toBe(401);

      const success = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
      expect(success.response.statusCode).toBe(200);
      const rawToken = success.response.cookies.find(
        (cookie) => cookie.name === 'mernpress_session',
      )?.value;

      expect(logs).not.toContain(uniquePassword);
      expect(logs).not.toContain(ADMIN_PASSWORD);
      if (rawToken) {
        expect(logs).not.toContain(rawToken);
      }
      expect(logs).not.toContain('mernpress_session=');
    } finally {
      await app.close();
    }
  });
});
