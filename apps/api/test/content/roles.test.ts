import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ADMIN_ORIGIN, createTestApp, loginAs, seedUser, type TestRole } from '../helpers/auth.js';

/**
 * Role × capability matrix regression tests (ADR 0004). These prove the
 * server-side, object-level authorization that was previously blocked on P2-04.
 * No UI hiding is relied on: every assertion calls the endpoint directly.
 */

interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

interface PostShape {
  id: string;
  status: string;
  version: number;
  authorId: string | null;
  terms: { categories: unknown[]; tags: unknown[] };
}

interface Session {
  cookieHeader: string;
  csrfToken: string;
  userId: string;
  role: TestRole;
}

const PASSWORD = 'Correct horse battery staple';

async function makeUser(app: FastifyInstance, role: TestRole, username: string): Promise<Session> {
  const created = await seedUser(app, { username, password: PASSWORD, role });
  const session = await loginAs(app, username, PASSWORD);
  return {
    cookieHeader: session.cookieHeader,
    csrfToken: session.csrfToken,
    userId: created.id,
    role,
  };
}

function headers(session: Session): Record<string, string> {
  return {
    cookie: session.cookieHeader,
    'x-csrf-token': session.csrfToken,
    origin: ADMIN_ORIGIN,
    'content-type': 'application/json',
  };
}

function readHeaders(session: Session): Record<string, string> {
  return { cookie: session.cookieHeader };
}

describe('role × capability matrix (ADR 0004)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createPostAs(session: Session, title: string) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: headers(session),
      payload: { type: 'post', title },
    });
  }

  async function mustCreatePostAs(session: Session, title: string): Promise<PostShape> {
    const response = await createPostAs(session, title);
    expect(response.statusCode).toBe(201);
    return response.json() as PostShape;
  }

  async function createTermAs(session: Session, name: string) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/terms',
      headers: headers(session),
      payload: { taxonomy: 'category', name },
    });
  }

  async function transitionAs(session: Session, id: string, action: string, baseVersion: number) {
    return app.inject({
      method: 'POST',
      url: `/api/admin/posts/${id}/${action}`,
      headers: headers(session),
      payload: { baseVersion },
    });
  }

  async function patchAs(session: Session, id: string, baseVersion: number, title: string) {
    return app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${id}`,
      headers: headers(session),
      payload: { baseVersion, title },
    });
  }

  // ---- subscriber: no capabilities ----

  it('subscriber cannot create, read, or manage taxonomy', async () => {
    const sub = await makeUser(app, 'subscriber', 'sub1');

    const create = await createPostAs(sub, 'Nope');
    expect(create.statusCode).toBe(403);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/posts',
      headers: readHeaders(sub),
    });
    expect(list.statusCode).toBe(403);

    const term = await createTermAs(sub, 'Nope');
    expect(term.statusCode).toBe(403);
  });

  // ---- contributor: own drafts only, no publish ----

  it('contributor can create and edit their own draft but cannot publish, trash, or manage taxonomy', async () => {
    const contrib = await makeUser(app, 'contributor', 'contrib1');
    const post = await mustCreatePostAs(contrib, 'My draft');
    expect(post.authorId).toBe(contrib.userId);
    expect(post.status).toBe('DRAFT');

    // Edit own draft: allowed.
    const edit = await patchAs(contrib, post.id, post.version, 'Edited draft');
    expect(edit.statusCode).toBe(200);

    // Publish: denied (contributor has no publish capability).
    const v1 = (edit.json() as PostShape).version;
    const publish = await transitionAs(contrib, post.id, 'publish', v1);
    expect(publish.statusCode).toBe(403);

    // Trash: denied.
    const trash = await transitionAs(contrib, post.id, 'trash', v1);
    expect(trash.statusCode).toBe(403);

    // Manage taxonomy: denied.
    const term = await createTermAs(contrib, 'Nope');
    expect(term.statusCode).toBe(403);
  });

  it('contributor cannot edit another user\u2019s draft', async () => {
    const contribA = await makeUser(app, 'contributor', 'contribA');
    const contribB = await makeUser(app, 'contributor', 'contribB');
    const post = await mustCreatePostAs(contribA, 'A draft');

    const edit = await patchAs(contribB, post.id, post.version, 'Hijack');
    expect(edit.statusCode).toBe(403);
    expect((edit.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');
  });

  it('contributor can read their own draft and the list (content.read.any)', async () => {
    const contrib = await makeUser(app, 'contributor', 'contribRead');
    const post = await mustCreatePostAs(contrib, 'Readable draft');

    // Read their own draft by id: allowed (ADR 0004 grants contributor read.any).
    const get = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}`,
      headers: readHeaders(contrib),
    });
    expect(get.statusCode).toBe(200);

    // List posts: allowed.
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/posts',
      headers: readHeaders(contrib),
    });
    expect(list.statusCode).toBe(200);
  });

  it('contributor cannot edit their own post once it is published (only drafts)', async () => {
    const contrib = await makeUser(app, 'contributor', 'contrib2');
    const editor = await makeUser(app, 'editor', 'editor1');
    const post = await mustCreatePostAs(contrib, 'Will be published');

    // An editor publishes it.
    const published = await transitionAs(editor, post.id, 'publish', post.version);
    expect(published.statusCode).toBe(200);
    const publishedPost = published.json() as PostShape;

    // The contributor can no longer edit it (it is no longer a draft).
    const edit = await patchAs(contrib, post.id, publishedPost.version, 'Try edit');
    expect(edit.statusCode).toBe(403);
  });

  // ---- author: full lifecycle on own content only ----

  it('author can create, edit, publish, trash and restore their own content', async () => {
    const author = await makeUser(app, 'author', 'author1');
    const post = await mustCreatePostAs(author, 'Author post');

    const edit = await patchAs(author, post.id, post.version, 'Author edited');
    expect(edit.statusCode).toBe(200);

    const publish = await transitionAs(
      author,
      post.id,
      'publish',
      (edit.json() as PostShape).version,
    );
    expect(publish.statusCode).toBe(200);
    expect((publish.json() as PostShape).status).toBe('PUBLISHED');

    const trash = await transitionAs(
      author,
      post.id,
      'trash',
      (publish.json() as PostShape).version,
    );
    expect(trash.statusCode).toBe(200);
    expect((trash.json() as PostShape).status).toBe('TRASHED');

    const restore = await transitionAs(
      author,
      post.id,
      'restore',
      (trash.json() as PostShape).version,
    );
    expect(restore.statusCode).toBe(200);
    expect((restore.json() as PostShape).status).toBe('PUBLISHED');
  });

  it('author cannot edit, publish, or trash another user\u2019s content', async () => {
    const authorA = await makeUser(app, 'author', 'authorA');
    const authorB = await makeUser(app, 'author', 'authorB');
    const post = await mustCreatePostAs(authorA, 'A content');

    const edit = await patchAs(authorB, post.id, post.version, 'Hijack');
    expect(edit.statusCode).toBe(403);

    const publish = await transitionAs(authorB, post.id, 'publish', post.version);
    expect(publish.statusCode).toBe(403);

    const trash = await transitionAs(authorB, post.id, 'trash', post.version);
    expect(trash.statusCode).toBe(403);

    // Authorization must run before the optimistic-concurrency check: a wrong
    // version must not turn into 409, which would let an unauthorized caller
    // probe the hidden object's version counter.
    const publishWrongVersion = await transitionAs(authorB, post.id, 'publish', post.version + 1);
    expect(publishWrongVersion.statusCode).toBe(403);
    expect((publishWrongVersion.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');

    const trashWrongVersion = await transitionAs(authorB, post.id, 'trash', post.version + 1);
    expect(trashWrongVersion.statusCode).toBe(403);
    expect((trashWrongVersion.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');
  });

  it('author cannot manage taxonomy but can assign existing terms to their own content', async () => {
    const author = await makeUser(app, 'author', 'author2');
    const editor = await makeUser(app, 'editor', 'editor2');

    // Author cannot create a term.
    const term = await createTermAs(author, 'Author term');
    expect(term.statusCode).toBe(403);

    // Editor creates a term; author assigns it to their own post.
    const created = await createTermAs(editor, 'Shared cat');
    expect(created.statusCode).toBe(201);
    const termId = (created.json() as { id: string }).id;

    const post = await mustCreatePostAs(author, 'Author tagged');
    const assign = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/terms`,
      headers: headers(author),
      payload: { categoryIds: [termId], tagIds: [] },
    });
    expect(assign.statusCode).toBe(200);
    expect((assign.json() as PostShape).terms.categories).toHaveLength(1);
  });

  // ---- editor: any content + taxonomy ----

  it('editor can edit, publish, and trash any user\u2019s content and manage taxonomy', async () => {
    const author = await makeUser(app, 'author', 'author3');
    const editor = await makeUser(app, 'editor', 'editor3');
    const post = await mustCreatePostAs(author, 'Author content');

    const edit = await patchAs(editor, post.id, post.version, 'Editor override');
    expect(edit.statusCode).toBe(200);

    const publish = await transitionAs(
      editor,
      post.id,
      'publish',
      (edit.json() as PostShape).version,
    );
    expect(publish.statusCode).toBe(200);

    const trash = await transitionAs(
      editor,
      post.id,
      'trash',
      (publish.json() as PostShape).version,
    );
    expect(trash.statusCode).toBe(200);

    const term = await createTermAs(editor, 'Editor cat');
    expect(term.statusCode).toBe(201);
  });

  it('editor cannot manage users (user.manage stays administrator-only)', async () => {
    // There is no user-management route in Phase 3; the capability exists in the
    // registry only. Prove the registry denies it for editor and grants it for admin.
    const { roleHasCapability } = await import('@mernpress/cms-core');
    expect(roleHasCapability('editor', 'user.manage')).toBe(false);
    expect(roleHasCapability('administrator', 'user.manage')).toBe(true);
  });

  // ---- private drafts: visibility is ownership-bound (pre-Phase-3-acceptance fix) ----

  it('an author cannot read, list, or count another author\u2019s draft', async () => {
    const author = await makeUser(app, 'author', 'author4');
    const authorB = await makeUser(app, 'author', 'author5');
    const post = await mustCreatePostAs(author, 'Private draft');

    // Direct read of a hidden draft returns 404 (not 403) to avoid leaking existence.
    const get = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}`,
      headers: readHeaders(authorB),
    });
    expect(get.statusCode).toBe(404);
    expect((get.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');

    // The draft is absent from the other author's list.
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/posts',
      headers: readHeaders(authorB),
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: Array<{ id: string }>; pagination: { total: number } };
    expect(body.items.map((p) => p.id)).not.toContain(post.id);
    expect(body.pagination.total).toBe(0);

    // Still cannot edit it.
    const edit = await patchAs(authorB, post.id, post.version, 'Hijack');
    expect(edit.statusCode).toBe(403);
  });
});
