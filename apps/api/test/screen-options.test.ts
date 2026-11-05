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

interface ScreenOptionsShape {
  perPage: Record<string, number>;
  hiddenColumns: Record<string, string[]>;
  viewMode: Record<string, string>;
  dashboardHidden: string[];
  dashboardColumns: number;
  editorHiddenPanels: string[];
}

describe('per-user Screen Options', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    headers = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app.close();
  });

  async function get(requestHeaders = headers) {
    return app.inject({
      method: 'GET',
      url: '/api/profile/screen-options',
      headers: requestHeaders,
    });
  }

  async function put(options: unknown, requestHeaders = headers) {
    return app.inject({
      method: 'PUT',
      url: '/api/profile/screen-options',
      headers: requestHeaders,
      payload: { options },
    });
  }

  it('returns the defaults and persists a normalized map', async () => {
    const initial = await get();
    expect(initial.statusCode).toBe(200);
    expect((initial.json() as { options: ScreenOptionsShape }).options).toEqual({
      perPage: {},
      hiddenColumns: {},
      viewMode: {},
      dashboardHidden: [],
      dashboardColumns: 2,
      editorHiddenPanels: [],
    });

    const saved = await put({
      perPage: { posts: 25, pages: 500 },
      hiddenColumns: { posts: ['author', 'bad id!', 'author'] },
      viewMode: { posts: 'compact', pages: 'huge' },
      dashboardHidden: ['events', 'evil', 'events'],
      dashboardColumns: 1,
      editorHiddenPanels: ['format', 'nope'],
    });
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as { options: ScreenOptionsShape }).options).toEqual({
      perPage: { posts: 25 },
      hiddenColumns: { posts: ['author'] },
      viewMode: { posts: 'compact' },
      dashboardHidden: ['events'],
      dashboardColumns: 1,
      editorHiddenPanels: ['format'],
    });

    const reread = await get();
    expect((reread.json() as { options: ScreenOptionsShape }).options).toEqual({
      perPage: { posts: 25 },
      hiddenColumns: { posts: ['author'] },
      viewMode: { posts: 'compact' },
      dashboardHidden: ['events'],
      dashboardColumns: 1,
      editorHiddenPanels: ['format'],
    });
  });

  it('keeps each user’s options separate and rejects anonymous access', async () => {
    expect((await put({ perPage: { posts: 50 } })).statusCode).toBe(200);

    await seedUser(app, {
      username: 'options-editor',
      password: 'Options-pass-2026!',
      role: 'editor',
    });
    const editor = await loginAs(app, 'options-editor', 'Options-pass-2026!');
    const editorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: editor.cookieHeader,
      'x-csrf-token': editor.csrfToken,
      'content-type': 'application/json',
    };
    const editorRead = await get(editorHeaders);
    expect((editorRead.json() as { options: ScreenOptionsShape }).options.perPage).toEqual({});

    const editorSaved = await put({ editorHiddenPanels: ['sticky'] }, editorHeaders);
    expect(
      (editorSaved.json() as { options: ScreenOptionsShape }).options.editorHiddenPanels,
    ).toEqual(['sticky']);

    const adminRead = await get();
    expect((adminRead.json() as { options: ScreenOptionsShape }).options).toMatchObject({
      perPage: { posts: 50 },
      editorHiddenPanels: [],
    });

    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/profile/screen-options',
    });
    expect(anonymous.statusCode).toBe(401);
    const anonymousWrite = await app.inject({
      method: 'PUT',
      url: '/api/profile/screen-options',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { options: {} },
    });
    expect(anonymousWrite.statusCode).toBe(401);
  });

  it('rejects a malformed body but normalizes unknown fields inside it', async () => {
    const malformed = await app.inject({
      method: 'PUT',
      url: '/api/profile/screen-options',
      headers,
      payload: { options: {}, extra: true },
    });
    expect(malformed.statusCode).toBe(400);

    const normalized = await put({ unknown: 'ignored', dashboardColumns: 99 });
    expect(normalized.statusCode).toBe(200);
    expect((normalized.json() as { options: ScreenOptionsShape }).options.dashboardColumns).toBe(2);
  });
});
