import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
});

afterEach(async () => {
  await app.close();
});

async function adminHeaders() {
  const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
  return {
    origin: ADMIN_ORIGIN,
    cookie: cookieHeader,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json',
  };
}

describe('connectors api', () => {
  it('lists the built-in providers as not configured', async () => {
    const headers = await adminHeaders();
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/connectors',
      headers: { cookie: headers.cookie },
    });
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: Array<{ id: string; configured: boolean }> }).items;
    expect(items.map((item) => item.id)).toEqual(['openai', 'google', 'anthropic']);
    expect(items.every((item) => item.configured === false)).toBe(true);
  });

  it('stores a key encrypted, returns only a mask, and disconnects', async () => {
    const headers = await adminHeaders();
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/admin/connectors/openai',
      headers,
      payload: { apiKey: 'sk-test-1234567890abcdef' },
    });
    expect(saved.statusCode).toBe(200);
    const openai = (
      saved.json() as {
        items: Array<{ id: string; configured: boolean; maskedKey: string | null }>;
      }
    ).items.find((item) => item.id === 'openai');
    expect(openai).toMatchObject({ configured: true });
    expect(openai?.maskedKey).toBe('sk-…cdef');

    const row = await app.database.option.findUnique({ where: { key: 'connector_key_openai' } });
    expect(row).not.toBeNull();
    expect(row!.value).not.toContain('sk-test-1234567890abcdef');
    expect(row!.value).toContain('encrypted');

    const disconnected = await app.inject({
      method: 'DELETE',
      url: '/api/admin/connectors/openai',
      headers: {
        cookie: headers.cookie,
        'x-csrf-token': headers['x-csrf-token'],
        origin: ADMIN_ORIGIN,
      },
    });
    expect(disconnected.statusCode).toBe(200);
    expect(
      (disconnected.json() as { items: Array<{ id: string; configured: boolean }> }).items.find(
        (item) => item.id === 'openai',
      ),
    ).toMatchObject({ configured: false });
  });

  it('rejects short keys, unknown providers, editors and anonymous callers', async () => {
    const headers = await adminHeaders();
    const short = await app.inject({
      method: 'PUT',
      url: '/api/admin/connectors/openai',
      headers,
      payload: { apiKey: 'short' },
    });
    expect(short.statusCode).toBe(400);

    const unknown = await app.inject({
      method: 'PUT',
      url: '/api/admin/connectors/nope',
      headers,
      payload: { apiKey: 'sk-test-1234567890abcdef' },
    });
    expect(unknown.statusCode).toBe(404);

    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/connectors' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const { cookieHeader } = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const editor = await app.inject({
      method: 'GET',
      url: '/api/admin/connectors',
      headers: { cookie: cookieHeader },
    });
    expect(editor.statusCode).toBe(403);
  });
});
