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

describe('content/taxonomy authorization', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('anonymous requests are rejected', () => {
    it('rejects an anonymous create post with 401 UNAUTHENTICATED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/posts',
        headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
        payload: { type: 'post', title: 'Anon' },
      });

      expect(response.statusCode).toBe(401);
      expect((response.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an anonymous create term with 401 UNAUTHENTICATED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/terms',
        headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
        payload: { taxonomy: 'category', name: 'Anon' },
      });

      expect(response.statusCode).toBe(401);
      expect((response.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects anonymous reads of admin content routes with 401', async () => {
      const posts = await app.inject({ method: 'GET', url: '/api/admin/posts' });
      expect(posts.statusCode).toBe(401);

      const terms = await app.inject({ method: 'GET', url: '/api/admin/terms' });
      expect(terms.statusCode).toBe(401);
    });
  });

  describe('CSRF enforcement on mutations', () => {
    it('rejects a mutating request without x-csrf-token with 403 CSRF_INVALID', async () => {
      const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/posts',
        headers: {
          cookie: cookieHeader,
          origin: ADMIN_ORIGIN,
          'content-type': 'application/json',
        },
        payload: { type: 'post', title: 'No CSRF' },
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as ErrorEnvelope).error.code).toBe('CSRF_INVALID');
    });

    it('rejects a mutating request with a wrong CSRF token with 403 CSRF_INVALID', async () => {
      const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/terms',
        headers: {
          cookie: cookieHeader,
          'x-csrf-token': 'not-the-session-token',
          origin: ADMIN_ORIGIN,
          'content-type': 'application/json',
        },
        payload: { taxonomy: 'tag', name: 'Bad CSRF' },
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as ErrorEnvelope).error.code).toBe('CSRF_INVALID');
    });

    it('allows GET requests without a CSRF token', async () => {
      const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/posts',
        headers: { cookie: cookieHeader },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('disabled user sessions', () => {
    it('rejects requests once the user is disabled with 401 UNAUTHENTICATED', async () => {
      const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

      await app.database.user.update({
        where: { username: ADMIN_USERNAME },
        data: { status: 'disabled' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/posts',
        headers: {
          cookie: cookieHeader,
          'x-csrf-token': csrfToken,
          origin: ADMIN_ORIGIN,
          'content-type': 'application/json',
        },
        payload: { type: 'post', title: 'Disabled user' },
      });

      expect(response.statusCode).toBe(401);
      expect((response.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('administrator can do everything (sanity)', () => {
    it('creates a post and a term with a valid session + CSRF', async () => {
      const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
      const headers = {
        cookie: cookieHeader,
        'x-csrf-token': csrfToken,
        origin: ADMIN_ORIGIN,
        'content-type': 'application/json',
      };

      const post = await app.inject({
        method: 'POST',
        url: '/api/admin/posts',
        headers,
        payload: { type: 'post', title: 'Admin power' },
      });
      expect(post.statusCode).toBe(201);

      const term = await app.inject({
        method: 'POST',
        url: '/api/admin/terms',
        headers,
        payload: { taxonomy: 'category', name: 'Admin power' },
      });
      expect(term.statusCode).toBe(201);
    });
  });

  describe('public routes need no auth', () => {
    it('serves GET /api/public/posts without cookies', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/public/posts' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: unknown[]; pagination: { total: number } };
      expect(body.items).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('returns 404 (not 401) for an unknown public slug', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public/posts/no-such-post?type=post',
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');
    });
  });
});
