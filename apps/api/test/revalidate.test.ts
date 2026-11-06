import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createRevalidator } from '../src/revalidate.js';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from './helpers/auth.js';

const secret = 'test-revalidate-secret-2026-11-06';
const silent = { warn: () => undefined };

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('public cache revalidation webhook', () => {
  it('posts the tag to the private web origin', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const revalidate = createRevalidator({
      url: 'http://127.0.0.1:3100/api/revalidate',
      secret,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: silent,
    });

    revalidate('content.post.published');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:3100/api/revalidate');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-revalidate-secret']).toBe(secret);
    expect(JSON.parse(String(init.body))).toEqual({ tags: ['public-content'] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('does nothing when unconfigured and never throws on a web failure', async () => {
    const fetchImpl = vi.fn();
    const revalidate = createRevalidator({ fetchImpl: fetchImpl as unknown as typeof fetch });
    revalidate('content.post.published');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchImpl).not.toHaveBeenCalled();

    const warn = vi.fn();
    const failing = createRevalidator({
      url: 'http://127.0.0.1:3100/api/revalidate',
      secret,
      fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch,
      logger: { warn },
    });
    expect(() => failing('content.post.updated')).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn.mock.calls[0]?.[1]).toBe('public cache revalidation failed');
  });

  it('invalidates after a real publish through the app hooks', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)).tags[0]);
      expect(url).toBe('http://127.0.0.1:3100/api/revalidate');
      return new Response('{}', { status: 200 });
    });
    app = await createTestApp({
      WEB_REVALIDATE_URL: 'http://127.0.0.1:3100/api/revalidate',
      WEB_REVALIDATE_SECRET: secret,
      revalidateFetch: fetchImpl as unknown as typeof fetch,
    });
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const headers = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: { type: 'post', title: 'Revalidate me' },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as { id: string; version: number };
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));

    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(published.statusCode).toBe(200);
    await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(calls.every((tag) => tag === 'public-content')).toBe(true);
  });
});
