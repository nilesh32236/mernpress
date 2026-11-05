import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PostNote } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from '../helpers/auth.js';

interface AdminPostShape {
  id: string;
  title: string;
  version: number;
}

describe('editor notes', () => {
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

  async function createPost(title = 'Notes target'): Promise<AdminPostShape> {
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
    return response.json() as AdminPostShape;
  }

  async function addNote(
    postId: string,
    content: string,
    parentId?: string,
    requestHeaders = headers,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/admin/posts/${postId}/notes`,
      headers: requestHeaders,
      payload: { content, ...(parentId ? { parentId } : {}) },
    });
  }

  async function listNotes(postId: string, requestHeaders = headers) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${postId}/notes`,
      headers: requestHeaders,
    });
    return response;
  }

  it('creates a note thread, replies, resolves and reopens it', async () => {
    const post = await createPost();

    const created = await addNote(post.id, 'Please tighten this paragraph.');
    expect(created.statusCode).toBe(201);
    const root = created.json() as PostNote;
    expect(root).toMatchObject({
      postId: post.id,
      parentId: null,
      content: 'Please tighten this paragraph.',
      resolvedAt: null,
      resolvedBy: null,
    });
    expect(root.author).toMatchObject({ username: ADMIN_USERNAME });

    const reply = await addNote(post.id, 'Done in the next revision.', root.id);
    expect(reply.statusCode).toBe(201);
    expect((reply.json() as PostNote).parentId).toBe(root.id);

    const nested = await addNote(post.id, 'Nested reply', (reply.json() as PostNote).id);
    expect(nested.statusCode).toBe(400);

    const list = await listNotes(post.id);
    expect(list.statusCode).toBe(200);
    const notes = (list.json() as { notes: PostNote[] }).notes;
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => note.content)).toEqual([
      'Please tighten this paragraph.',
      'Done in the next revision.',
    ]);

    const resolved = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}/notes/${root.id}`,
      headers,
      payload: { resolved: true },
    });
    expect(resolved.statusCode).toBe(200);
    const resolvedRoot = resolved.json() as PostNote;
    expect(resolvedRoot.resolvedAt).toEqual(expect.any(String));
    expect(resolvedRoot.resolvedBy).toMatchObject({ username: ADMIN_USERNAME });

    const replyToResolved = await addNote(post.id, 'One more thought.', root.id);
    expect(replyToResolved.statusCode).toBe(400);

    const replyResolve = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}/notes/${(reply.json() as PostNote).id}`,
      headers,
      payload: { resolved: true },
    });
    expect(replyResolve.statusCode).toBe(400);

    const reopened = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}/notes/${root.id}`,
      headers,
      payload: { resolved: false },
    });
    expect(reopened.statusCode).toBe(200);
    expect((reopened.json() as PostNote).resolvedAt).toBeNull();
  });

  it('validates content, parents and ids', async () => {
    const post = await createPost();
    expect((await addNote(post.id, '   ')).statusCode).toBe(400);
    expect((await addNote(post.id, 'x'.repeat(2001))).statusCode).toBe(400);

    const missingParent = await addNote(post.id, 'Reply', '00000000-0000-7000-8000-000000000000');
    expect(missingParent.statusCode).toBe(400);

    const otherPost = await createPost('Other notes target');
    const root = (await addNote(post.id, 'Root note')).json() as PostNote;
    const wrongPostParent = await addNote(otherPost.id, 'Reply', root.id);
    expect(wrongPostParent.statusCode).toBe(400);

    const missing = await listNotes('00000000-0000-7000-8000-000000000000');
    expect(missing.statusCode).toBe(404);
  });

  it('stores a block anchor on root notes and rejects invalid anchors', async () => {
    const post = await createPost();
    const block = {
      name: 'core/paragraph',
      path: '1.0',
      hash: '0123456789abcdef',
      text: 'Anchored note',
      anchorId: 'aaaabbbbccccdddd',
    };

    const created = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/notes`,
      headers,
      payload: { content: 'Anchored note', block },
    });
    expect(created.statusCode).toBe(201);
    const root = created.json() as PostNote;
    expect(root.block).toEqual(block);

    const list = await listNotes(post.id);
    expect((list.json() as { notes: PostNote[] }).notes[0]?.block).toEqual(block);

    // Replies inherit their thread and cannot carry their own anchor.
    const reply = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/notes`,
      headers,
      payload: { content: 'Reply', parentId: root.id, block },
    });
    expect(reply.statusCode).toBe(400);

    for (const invalid of [
      { name: 'not a block', path: '0', hash: '0123456789abcdef' },
      { name: 'core/paragraph', path: 'x.y', hash: '0123456789abcdef' },
      { name: 'core/paragraph', path: '0', hash: 'XYZ' },
      {
        name: 'core/paragraph',
        path: '0',
        hash: '0123456789abcdef',
        text: 'x',
        anchorId: 'not-an-id',
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/posts/${post.id}/notes`,
        headers,
        payload: { content: 'Bad anchor', block: invalid },
      });
      expect(response.statusCode, JSON.stringify(invalid)).toBe(400);
    }
  });

  it('trashes, restores and purges notes with permissions, cascades and audits', async () => {
    // A post owned by an author: they may trash their own note but not an
    // editor's reply; the editor may act on anything on the post.
    await seedUser(app, {
      username: 'note-owner',
      password: 'Owner-pass-2026!',
      role: 'author',
    });
    const owner = await loginAs(app, 'note-owner', 'Owner-pass-2026!');
    const ownerHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: owner.cookieHeader,
      'x-csrf-token': owner.csrfToken,
      'content-type': 'application/json',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: ownerHeaders,
      payload: {
        type: 'post',
        title: 'Owned notes post',
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
      },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPostShape;

    const root = (
      await addNote(post.id, 'Owner root note', undefined, ownerHeaders)
    ).json() as PostNote;
    const reply = (await addNote(post.id, 'Owner reply', root.id, ownerHeaders)).json() as PostNote;

    await seedUser(app, { username: 'note-editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'note-editor', 'Editor-pass-2026!');
    const editorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: editor.cookieHeader,
      'x-csrf-token': editor.csrfToken,
      'content-type': 'application/json',
    };
    const editorReply = (
      await addNote(post.id, 'Editor reply', root.id, editorHeaders)
    ).json() as PostNote;

    const { 'content-type': _ownerContentType, ...ownerDeleteHeaders } = ownerHeaders;
    const { 'content-type': _editorContentType, ...editorDeleteHeaders } = editorHeaders;

    // The owner cannot trash the editor's reply (no edit-any).
    const forbidden = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/${editorReply.id}`,
      headers: ownerDeleteHeaders,
    });
    expect(forbidden.statusCode).toBe(403);

    // The editor may trash the owner's reply; it lands in Trash, not oblivion.
    const editorTrash = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/${reply.id}`,
      headers: editorDeleteHeaders,
    });
    expect(editorTrash.statusCode).toBe(204);
    const afterReplyTrash = await listNotes(post.id, ownerHeaders);
    const lists = afterReplyTrash.json() as { notes: PostNote[]; trash: PostNote[] };
    expect(lists.notes.map((note) => note.content)).toEqual(['Owner root note', 'Editor reply']);
    expect(lists.trash.map((note) => note.content)).toEqual(['Owner reply']);
    expect(lists.trash[0]?.deletedAt).toEqual(expect.any(String));
    expect(lists.trash[0]?.deletedBy).toMatchObject({ username: 'note-editor' });

    // Trashing the root cascades its remaining replies.
    const ownerTrash = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/${root.id}`,
      headers: ownerDeleteHeaders,
    });
    expect(ownerTrash.statusCode).toBe(204);
    const allTrashed = (await listNotes(post.id, ownerHeaders)).json() as {
      notes: PostNote[];
      trash: PostNote[];
    };
    expect(allTrashed.notes).toEqual([]);
    expect(allTrashed.trash).toHaveLength(3);

    const trashOnly = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}/notes?status=trash`,
      headers: { cookie: owner.cookieHeader },
    });
    expect(trashOnly.statusCode).toBe(200);
    expect((trashOnly.json() as { trash: PostNote[] }).trash).toHaveLength(3);

    // Restoring the thread restores its trashed replies.
    const restored = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/notes/${root.id}/restore`,
      headers: ownerHeaders,
      payload: {},
    });
    expect(restored.statusCode, restored.body).toBe(200);
    expect((restored.json() as PostNote).deletedAt).toBeNull();
    const afterRestore = (await listNotes(post.id, ownerHeaders)).json() as {
      notes: PostNote[];
      trash: PostNote[];
    };
    expect(afterRestore.notes).toHaveLength(3);
    expect(afterRestore.trash).toEqual([]);

    // Permanent deletion requires Trash first.
    const purgeActive = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/${root.id}/permanent`,
      headers: ownerDeleteHeaders,
    });
    expect(purgeActive.statusCode).toBe(400);

    // Trash one reply again and purge it permanently.
    await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/${reply.id}`,
      headers: ownerDeleteHeaders,
    });
    const purged = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/${reply.id}/permanent`,
      headers: ownerDeleteHeaders,
    });
    expect(purged.statusCode).toBe(204);
    const afterPurge = (await listNotes(post.id, ownerHeaders)).json() as {
      notes: PostNote[];
      trash: PostNote[];
    };
    expect(afterPurge.notes).toHaveLength(2);
    expect(afterPurge.trash).toEqual([]);

    // Trashed notes cannot be resolved or replied to until restored.
    await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/${editorReply.id}`,
      headers: editorDeleteHeaders,
    });
    const resolveTrashed = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}/notes/${editorReply.id}`,
      headers,
      payload: { resolved: true },
    });
    expect(resolveTrashed.statusCode).toBe(400);
    const replyToTrashed = await addNote(post.id, 'Too late', editorReply.id, ownerHeaders);
    expect(replyToTrashed.statusCode).toBe(400);

    const audit = await app.database.auditEvent.findMany({
      where: {
        eventType: {
          in: ['content.note.trashed', 'content.note.restored', 'content.note.deleted'],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.filter((event) => event.eventType === 'content.note.trashed')).toHaveLength(4);
    expect(audit.filter((event) => event.eventType === 'content.note.restored')).toHaveLength(1);
    const purgedEvent = audit.find((event) => event.eventType === 'content.note.deleted');
    expect(purgedEvent?.metadata).toMatchObject({ postId: post.id, permanent: true, replies: 0 });

    const missing = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/notes/00000000-0000-7000-8000-000000000000`,
      headers: ownerDeleteHeaders,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('limits notes to users who can edit the post', async () => {
    const post = await createPost();
    const root = (await addNote(post.id, 'Admin note')).json() as PostNote;

    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}/notes`,
    });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, {
      username: 'other-author',
      password: 'Author-pass-2026!',
      role: 'author',
    });
    const author = await loginAs(app, 'other-author', 'Author-pass-2026!');
    const authorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: author.cookieHeader,
      'x-csrf-token': author.csrfToken,
      'content-type': 'application/json',
    };
    expect((await listNotes(post.id, authorHeaders)).statusCode).toBe(403);
    expect((await addNote(post.id, 'Not mine', undefined, authorHeaders)).statusCode).toBe(403);

    await seedUser(app, {
      username: 'notes-editor',
      password: 'Editor-pass-2026!',
      role: 'editor',
    });
    const editor = await loginAs(app, 'notes-editor', 'Editor-pass-2026!');
    const editorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: editor.cookieHeader,
      'x-csrf-token': editor.csrfToken,
      'content-type': 'application/json',
    };
    const editorList = await listNotes(post.id, editorHeaders);
    expect(editorList.statusCode).toBe(200);
    const editorReply = await addNote(post.id, 'Editor reply', root.id, editorHeaders);
    expect(editorReply.statusCode).toBe(201);
    expect((editorReply.json() as PostNote).author).toMatchObject({ username: 'notes-editor' });
  });
});
