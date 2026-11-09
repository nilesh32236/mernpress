import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

describe('admin site health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns environment checks to an administrator and nothing to other roles', async () => {
    const admin = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const asAdmin = await app.inject({
      method: 'GET',
      url: '/api/admin/health',
      headers: { cookie: admin.cookieHeader },
    });
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.json()).toMatchObject({
      database: 'ok',
      mediaWritable: true,
      schedulerEnabled: false,
      nodeEnv: 'test',
    });

    await seedUser(app, {
      username: 'health-editor',
      password: 'Health-editor-pass-1!',
      role: 'editor',
    });
    const editor = await loginAs(app, 'health-editor', 'Health-editor-pass-1!');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/health',
          headers: { cookie: editor.cookieHeader },
        })
      ).statusCode,
    ).toBe(403);

    expect((await app.inject({ method: 'GET', url: '/api/admin/health' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/health',
          headers: { origin: ADMIN_ORIGIN },
        })
      ).statusCode,
    ).toBe(401);
  });
});
