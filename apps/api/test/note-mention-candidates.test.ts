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

interface CandidateShape {
  id: string;
  username: string;
  displayName: string | null;
}

describe('note mention candidates', () => {
  let app: FastifyInstance;
  let adminHeaders: Record<string, string>;
  let postId: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: adminHeaders,
      payload: {
        type: 'post',
        title: 'Mention candidates',
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
      },
    });
    expect(created.statusCode).toBe(201);
    postId = (created.json() as { id: string }).id;

    const editor = await seedUser(app, {
      username: 'notes-editor',
      password: 'Notes-pass-2026!',
      role: 'editor',
    });
    await app.database.user.update({
      where: { id: editor.id },
      data: { displayName: 'Notes Editor', email: 'notes-editor@example.com' },
    });
    const author = await seedUser(app, {
      username: 'notes-author',
      password: 'Author-pass-2026!',
      role: 'author',
    });
    await app.database.user.update({
      where: { id: author.id },
      data: { email: 'notes-author@example.com' },
    });
    const disabled = await seedUser(app, {
      username: 'disabled-editor',
      password: 'Disabled-pass-2026!',
      role: 'editor',
    });
    await app.database.user.update({
      where: { id: disabled.id },
      data: { status: 'disabled' },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function candidates(search = '', headers = adminHeaders) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return app.inject({
      method: 'GET',
      url: `/api/admin/posts/${postId}/note-mentions${query}`,
      headers,
    });
  }

  it('returns only active users who can edit the post, excluding the caller', async () => {
    const response = await candidates();
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: CandidateShape[] }).items;
    expect(items.map((item) => item.username)).toEqual(['notes-editor']);
    expect(items[0]).toMatchObject({ displayName: 'Notes Editor' });

    const byDisplayName = await candidates('Notes Ed');
    expect((byDisplayName.json() as { items: CandidateShape[] }).items).toHaveLength(1);
    const byUsername = await candidates('notes-ed');
    expect((byUsername.json() as { items: CandidateShape[] }).items).toHaveLength(1);
    const none = await candidates('zzzz');
    expect((none.json() as { items: CandidateShape[] }).items).toEqual([]);
  });

  it('rejects users who cannot edit the post and anonymous callers', async () => {
    const author = await loginAs(app, 'notes-author', 'Author-pass-2026!');
    const authorResponse = await candidates('', {
      origin: ADMIN_ORIGIN,
      cookie: author.cookieHeader,
      'x-csrf-token': author.csrfToken,
      'content-type': 'application/json',
    });
    expect(authorResponse.statusCode).toBe(403);

    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${postId}/note-mentions`,
    });
    expect(anonymous.statusCode).toBe(401);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/admin/posts/00000000-0000-7000-8000-000000000000/note-mentions',
      headers: adminHeaders,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('caps suggestions at eight users', async () => {
    for (let index = 0; index < 10; index += 1) {
      await seedUser(app, {
        username: `picker-editor-${index}`,
        password: 'Picker-pass-2026!',
        role: 'editor',
      });
    }
    const response = await candidates();
    expect((response.json() as { items: CandidateShape[] }).items).toHaveLength(8);
  });
});
