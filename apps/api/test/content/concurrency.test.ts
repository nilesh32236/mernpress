import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from '../helpers/auth.js';

interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

interface AdminPostShape {
  id: string;
  slug: string;
  version: number;
}

describe('content concurrency', () => {
  let app: FastifyInstance;
  let cookieHeader: string;
  let csrfToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookieHeader = session.cookieHeader;
    csrfToken = session.csrfToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows exactly one of two concurrent creates with the same explicit slug', async () => {
    const headers = {
      cookie: cookieHeader,
      'x-csrf-token': csrfToken,
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
    };
    const payload = { type: 'post', title: 'Race', slug: 'race-slug' };

    const [first, second] = await Promise.allSettled([
      app.inject({ method: 'POST', url: '/api/admin/posts', headers, payload }),
      app.inject({ method: 'POST', url: '/api/admin/posts', headers, payload }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('fulfilled');
    if (first.status !== 'fulfilled' || second.status !== 'fulfilled') {
      throw new Error('Both requests must settle fulfilled');
    }

    const statuses = [first.value.statusCode, second.value.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = [first.value, second.value].find((r) => r.statusCode === 201);
    const loser = [first.value, second.value].find((r) => r.statusCode === 409);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    expect((winner?.json() as AdminPostShape).slug).toBe('race-slug');
    expect((loser?.json() as ErrorEnvelope).error.code).toBe('SLUG_TAKEN');

    // Exactly one row survived the race.
    expect(await app.database.post.count({ where: { slug: 'race-slug' } })).toBe(1);
  });
});
