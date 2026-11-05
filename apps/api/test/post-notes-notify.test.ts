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

interface PostShape {
  id: string;
  version: number;
  notesNotify: boolean | null;
}

describe('per-post notes notification override', () => {
  let app: FastifyInstance;
  let adminHeaders: Record<string, string>;
  let adminCookie: string;

  beforeEach(async () => {
    app = await createTestApp({ MAIL_TRANSPORT: 'memory' });
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = session.cookieHeader;
    adminHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
    await app.database.option.upsert({
      where: { key: 'admin_email' },
      create: { key: 'admin_email', value: JSON.stringify('admin@example.com'), group: 'general' },
      update: { value: JSON.stringify('admin@example.com') },
    });
    await app.database.option.upsert({
      where: { key: 'site_url' },
      create: {
        key: 'site_url',
        value: JSON.stringify('https://mernpress.example'),
        group: 'general',
      },
      update: { value: JSON.stringify('https://mernpress.example') },
    });
    await seedUser(app, {
      username: 'override-editor',
      password: 'Override-pass-2026!',
      role: 'editor',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function createPost(notesNotify?: boolean | null): Promise<PostShape> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: adminHeaders,
      payload: {
        type: 'post',
        title: `Override ${Math.random().toString(36).slice(2, 8)}`,
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
        ...(notesNotify === undefined ? {} : { notesNotify }),
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as PostShape;
  }

  async function patchPost(post: PostShape, payload: Record<string, unknown>): Promise<PostShape> {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: { baseVersion: post.version, ...payload },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as PostShape;
  }

  async function editorSession() {
    const session = await loginAs(app, 'override-editor', 'Override-pass-2026!');
    return {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  }

  async function addNote(post: PostShape, headers: Record<string, string>, content: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/notes`,
      headers,
      payload: { content },
    });
    expect(response.statusCode).toBe(201);
  }

  async function setDiscussion(values: Record<string, unknown>) {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers: adminHeaders,
      payload: { group: 'discussion', values },
    });
    expect(response.statusCode).toBe(200);
  }

  it('persists the override and defaults to inherit', async () => {
    const inherited = await createPost();
    expect(inherited.notesNotify).toBeNull();

    const off = await createPost(false);
    expect(off.notesNotify).toBe(false);
    const offRead = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${off.id}`,
      headers: { cookie: adminCookie },
    });
    expect((offRead.json() as PostShape).notesNotify).toBe(false);

    const on = await patchPost(off, { notesNotify: true });
    expect(on.notesNotify).toBe(true);
    const cleared = await patchPost(on, { notesNotify: null });
    expect(cleared.notesNotify).toBeNull();

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${cleared.id}`,
      headers: adminHeaders,
      payload: { baseVersion: cleared.version, notesNotify: 'yes' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('per-post off suppresses notes mail even when Discussion is on', async () => {
    const post = await createPost(false);
    const editor = await editorSession();
    await setDiscussion({ notes_notify: true });

    await addNote(post, editor, 'A note that must stay quiet.');
    expect(app.mail.outbox).toHaveLength(0);

    await patchPost(post, { notesNotify: true });
    await addNote(post, editor, 'A note that must be mailed.');
    expect(app.mail.outbox).toHaveLength(1);
    expect(app.mail.outbox[0]!.to).toBe('admin@example.com');
    expect(app.mail.outbox[0]!.text).toContain('A note that must be mailed.');
  });

  it('per-post on sends even when the Discussion option is off', async () => {
    const post = await createPost(true);
    const editor = await editorSession();
    await setDiscussion({ notes_notify: false });

    await addNote(post, editor, 'Override wins over the global off.');
    expect(app.mail.outbox).toHaveLength(1);
    expect(app.mail.outbox[0]!.subject).toContain('added an editor note');

    // Mentions on the same post are also enabled by the override.
    await app.database.user.update({
      where: { username: 'override-editor' },
      data: { email: 'override@example.com', displayName: 'Override Editor' },
    });
    await addNote(post, adminHeaders, 'Ping @override-editor.');
    expect(app.mail.outbox).toHaveLength(2);
    expect(app.mail.outbox[1]!.to).toBe('override@example.com');
    expect(app.mail.outbox[1]!.subject).toContain('mentioned you in a note');
  });

  it('inherits the Discussion setting when the override is null', async () => {
    const post = await createPost(null);
    const editor = await editorSession();

    await setDiscussion({ notes_notify: false });
    await addNote(post, editor, 'Inherited off.');
    expect(app.mail.outbox).toHaveLength(0);

    await setDiscussion({ notes_notify: true });
    await addNote(post, editor, 'Inherited on.');
    expect(app.mail.outbox).toHaveLength(1);
  });
});
