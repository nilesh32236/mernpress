import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminPost, PostNote } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from './helpers/auth.js';

const DAY = 24 * 60 * 60 * 1000;

describe('editor-note trash retention sweep', () => {
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

  async function createPost(title = 'Retention target'): Promise<AdminPost> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: {
        type: 'post',
        title,
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as AdminPost;
  }

  async function addNote(postId: string, content: string, parentId?: string): Promise<PostNote> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${postId}/notes`,
      headers,
      payload: { content, ...(parentId ? { parentId } : {}) },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as PostNote;
  }

  async function trash(postId: string, noteId: string): Promise<void> {
    const { 'content-type': _contentType, ...deleteHeaders } = headers;
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${postId}/notes/${noteId}`,
      headers: deleteHeaders,
    });
    expect(response.statusCode).toBe(204);
  }

  async function backdate(postId: string, days: number): Promise<void> {
    await app.database.postNote.updateMany({
      where: { postId, deletedAt: { not: null } },
      data: { deletedAt: new Date(Date.now() - days * DAY) },
    });
  }

  it('purges expired threads with their replies and audits the automatic removal', async () => {
    const post = await createPost();
    const root = await addNote(post.id, 'Expired root');
    await addNote(post.id, 'Expired reply', root.id);
    await trash(post.id, root.id);
    await backdate(post.id, 40);

    const result = await app.notes.purgeExpiredTrash({ retentionDays: 30 });
    expect(result.purged).toBe(1);
    expect(await app.database.postNote.count({ where: { postId: post.id } })).toBe(0);

    const audit = await app.database.auditEvent.findMany({
      where: { eventType: 'content.note.deleted' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({
      postId: post.id,
      noteId: root.id,
      parentId: null,
      replies: 1,
      permanent: true,
      automatic: true,
    });
  });

  it('keeps fresh trash and purges standalone replies whose parent is active', async () => {
    const post = await createPost('Retention mixed');
    const freshRoot = await addNote(post.id, 'Fresh trash');
    await trash(post.id, freshRoot.id);

    const activeRoot = await addNote(post.id, 'Active root');
    const reply = await addNote(post.id, 'Old standalone reply', activeRoot.id);
    await trash(post.id, reply.id);
    await app.database.postNote.update({
      where: { id: reply.id },
      data: { deletedAt: new Date(Date.now() - 90 * DAY) },
    });

    const result = await app.notes.purgeExpiredTrash({ retentionDays: 30 });
    expect(result.purged).toBe(1);
    const remaining = await app.database.postNote.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(remaining.map((note) => note.content)).toEqual(['Fresh trash', 'Active root']);
    const audit = await app.database.auditEvent.findMany({
      where: { eventType: 'content.note.deleted' },
    });
    expect(audit[0]?.metadata).toMatchObject({
      noteId: reply.id,
      parentId: activeRoot.id,
      replies: 0,
      automatic: true,
    });
  });

  it('does nothing when retention is 0 and validates the option range', async () => {
    const post = await createPost('Retention disabled');
    const root = await addNote(post.id, 'Kept forever');
    await trash(post.id, root.id);
    await backdate(post.id, 400);

    expect((await app.notes.purgeExpiredTrash({ retentionDays: 0 })).purged).toBe(0);
    expect(await app.database.postNote.count({ where: { postId: post.id } })).toBe(1);

    const valid = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'discussion', values: { notes_trash_retention_days: 7 } },
    });
    expect(valid.statusCode).toBe(200);
    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'discussion', values: { notes_trash_retention_days: 366 } },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
