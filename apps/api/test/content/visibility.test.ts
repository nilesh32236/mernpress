import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ADMIN_ORIGIN, createTestApp, loginAs, seedUser, type TestRole } from '../helpers/auth.js';

interface PostShape {
  id: string;
  status: string;
  version: number;
  authorId: string | null;
}

const PASSWORD = 'Correct horse battery staple';

async function makeUser(app: FastifyInstance, role: TestRole, username: string) {
  const created = await seedUser(app, { username, password: PASSWORD, role });
  const session = await loginAs(app, username, PASSWORD);
  return {
    userId: created.id,
    role,
    cookieHeader: session.cookieHeader,
    csrfToken: session.csrfToken,
  };
}

function readHeaders(cookieHeader: string) {
  return { cookie: cookieHeader };
}

async function createPost(
  app: FastifyInstance,
  cookieHeader: string,
  csrfToken: string,
  title: string,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers: {
      cookie: cookieHeader,
      'x-csrf-token': csrfToken,
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
    },
    payload: { type: 'post', title },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as PostShape;
}

async function trashPost(
  app: FastifyInstance,
  cookieHeader: string,
  csrfToken: string,
  id: string,
  version: number,
) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/posts/${id}/trash`,
    headers: {
      cookie: cookieHeader,
      'x-csrf-token': csrfToken,
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
    },
    payload: { baseVersion: version },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as PostShape;
}

describe('content visibility (admin reads)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('direct read (GET /api/admin/posts/:id)', () => {
    it('owner can read their own draft and trashed content', async () => {
      const owner = await makeUser(app, 'author', 'owner1');
      const draft = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Own draft');
      const getDraft = await app.inject({
        method: 'GET',
        url: `/api/admin/posts/${draft.id}`,
        headers: readHeaders(owner.cookieHeader),
      });
      expect(getDraft.statusCode).toBe(200);

      await trashPost(app, owner.cookieHeader, owner.csrfToken, draft.id, draft.version);
      const getTrashed = await app.inject({
        method: 'GET',
        url: `/api/admin/posts/${draft.id}`,
        headers: readHeaders(owner.cookieHeader),
      });
      expect(getTrashed.statusCode).toBe(200);
      expect((getTrashed.json() as PostShape).status).toBe('TRASHED');
    });

    it('administrator and editor can read any draft or trashed content', async () => {
      const owner = await makeUser(app, 'author', 'owner2');
      const admin = await makeUser(app, 'administrator', 'adminV');
      const editor = await makeUser(app, 'editor', 'editorV');
      const draft = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Hidden draft');

      for (const principal of [admin, editor]) {
        const get = await app.inject({
          method: 'GET',
          url: `/api/admin/posts/${draft.id}`,
          headers: readHeaders(principal.cookieHeader),
        });
        expect(get.statusCode).toBe(200);
      }

      await trashPost(app, owner.cookieHeader, owner.csrfToken, draft.id, draft.version);
      for (const principal of [admin, editor]) {
        const get = await app.inject({
          method: 'GET',
          url: `/api/admin/posts/${draft.id}`,
          headers: readHeaders(principal.cookieHeader),
        });
        expect(get.statusCode).toBe(200);
      }
    });

    it('author/contributor cannot read another user draft or trashed content (404)', async () => {
      const owner = await makeUser(app, 'author', 'owner3');
      const otherAuthor = await makeUser(app, 'author', 'otherAuthor');
      const contributor = await makeUser(app, 'contributor', 'otherContrib');

      const draft = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Secret draft');

      for (const principal of [otherAuthor, contributor]) {
        const get = await app.inject({
          method: 'GET',
          url: `/api/admin/posts/${draft.id}`,
          headers: readHeaders(principal.cookieHeader),
        });
        expect(get.statusCode).toBe(404);
      }

      await trashPost(app, owner.cookieHeader, owner.csrfToken, draft.id, draft.version);
      for (const principal of [otherAuthor, contributor]) {
        const get = await app.inject({
          method: 'GET',
          url: `/api/admin/posts/${draft.id}`,
          headers: readHeaders(principal.cookieHeader),
        });
        expect(get.statusCode).toBe(404);
      }
    });

    it('author/contributor can read another user PUBLISHED content', async () => {
      const owner = await makeUser(app, 'author', 'owner4');
      const otherAuthor = await makeUser(app, 'author', 'otherAuthor2');
      const draft = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Will publish');

      const pub = await app.inject({
        method: 'POST',
        url: `/api/admin/posts/${draft.id}/publish`,
        headers: {
          cookie: owner.cookieHeader,
          'x-csrf-token': owner.csrfToken,
          origin: ADMIN_ORIGIN,
          'content-type': 'application/json',
        },
        payload: { baseVersion: draft.version },
      });
      expect(pub.statusCode).toBe(200);

      const get = await app.inject({
        method: 'GET',
        url: `/api/admin/posts/${draft.id}`,
        headers: readHeaders(otherAuthor.cookieHeader),
      });
      expect(get.statusCode).toBe(200);
    });

    it('subscriber is denied the admin content API entirely (403)', async () => {
      const sub = await makeUser(app, 'subscriber', 'subV');
      const get = await app.inject({
        method: 'GET',
        url: '/api/admin/posts',
        headers: readHeaders(sub.cookieHeader),
      });
      expect(get.statusCode).toBe(403);
    });

    it('non-existent id returns 404 for an administrator', async () => {
      const admin = await makeUser(app, 'administrator', 'adminV2');
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/posts/00000000-0000-0000-0000-000000000000',
        headers: readHeaders(admin.cookieHeader),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('list results and pagination counts', () => {
    it('excludes hidden drafts from rows and total count for a non-owner', async () => {
      const owner = await makeUser(app, 'author', 'ownerL');
      const reader = await makeUser(app, 'author', 'readerL');
      await createPost(app, owner.cookieHeader, owner.csrfToken, 'Owner draft');

      const list = await app.inject({
        method: 'GET',
        url: '/api/admin/posts',
        headers: readHeaders(reader.cookieHeader),
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as {
        items: Array<{ id: string }>;
        pagination: { total: number; totalPages: number };
      };
      expect(body.items).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.totalPages).toBe(0);
    });

    it('includes hidden drafts in rows and count for the owner', async () => {
      const owner = await makeUser(app, 'author', 'ownerL2');
      const draft = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Owner draft 2');

      const list = await app.inject({
        method: 'GET',
        url: '/api/admin/posts',
        headers: readHeaders(owner.cookieHeader),
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as { items: Array<{ id: string }>; pagination: { total: number } };
      expect(body.items.map((p) => p.id)).toContain(draft.id);
      expect(body.pagination.total).toBe(1);
    });

    it('paginates correctly with mixed visible/hidden content', async () => {
      const owner = await makeUser(app, 'author', 'ownerL3');
      const reader = await makeUser(app, 'author', 'readerL3');
      for (let i = 0; i < 3; i++) {
        await createPost(app, owner.cookieHeader, owner.csrfToken, `Draft ${i}`);
      }
      const pub = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Published one');
      const pubRes = await app.inject({
        method: 'POST',
        url: `/api/admin/posts/${pub.id}/publish`,
        headers: {
          cookie: owner.cookieHeader,
          'x-csrf-token': owner.csrfToken,
          origin: ADMIN_ORIGIN,
          'content-type': 'application/json',
        },
        payload: { baseVersion: pub.version },
      });
      expect(pubRes.statusCode).toBe(200);

      const list = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?page=1&perPage=10',
        headers: readHeaders(reader.cookieHeader),
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as { items: Array<{ id: string }>; pagination: { total: number } };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.id).toBe(pub.id);
      expect(body.pagination.total).toBe(1);

      const ownerList = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?page=1&perPage=10',
        headers: readHeaders(owner.cookieHeader),
      });
      const ownerBody = ownerList.json() as { pagination: { total: number } };
      expect(ownerBody.pagination.total).toBe(4);
    });

    it('trashed content of others is excluded from count', async () => {
      const owner = await makeUser(app, 'author', 'ownerL4');
      const reader = await makeUser(app, 'author', 'readerL4');
      const draft = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Will trash');
      await trashPost(app, owner.cookieHeader, owner.csrfToken, draft.id, draft.version);

      const list = await app.inject({
        method: 'GET',
        url: '/api/admin/posts',
        headers: readHeaders(reader.cookieHeader),
      });
      const body = list.json() as { pagination: { total: number } };
      expect(body.pagination.total).toBe(0);
    });

    it('status filter composes with visibility', async () => {
      const owner = await makeUser(app, 'author', 'ownerL5');
      const reader = await makeUser(app, 'author', 'readerL5');
      await createPost(app, owner.cookieHeader, owner.csrfToken, 'Owner draft');

      const list = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?status=DRAFT',
        headers: readHeaders(reader.cookieHeader),
      });
      const body = list.json() as { items: Array<{ id: string }>; pagination: { total: number } };
      expect(body.items).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('search composition with visibility', () => {
    it('non-owner search returns 0 rows and 0 total even when title matches a hidden draft', async () => {
      const owner = await makeUser(app, 'author', 'ownerS');
      const reader = await makeUser(app, 'author', 'readerS');
      await createPost(app, owner.cookieHeader, owner.csrfToken, 'Findable secret');

      const list = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?search=Findable',
        headers: readHeaders(reader.cookieHeader),
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as { items: Array<{ id: string }>; pagination: { total: number } };
      expect(body.items).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('editor list includes hidden drafts in total count', async () => {
      const owner = await makeUser(app, 'author', 'ownerS2');
      const editor = await makeUser(app, 'editor', 'editorS');
      await createPost(app, owner.cookieHeader, owner.csrfToken, 'Hidden from author');

      const list = await app.inject({
        method: 'GET',
        url: '/api/admin/posts',
        headers: readHeaders(editor.cookieHeader),
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as { pagination: { total: number } };
      expect(body.pagination.total).toBe(1);
    });
  });

  describe('all five roles', () => {
    it('visibility matrix holds across roles', async () => {
      const owner = await makeUser(app, 'author', 'ownerM');
      const draft = await createPost(app, owner.cookieHeader, owner.csrfToken, 'Matrix draft');

      const cases: Array<{ role: TestRole; expectVisible: boolean }> = [
        { role: 'administrator', expectVisible: true },
        { role: 'editor', expectVisible: true },
        { role: 'author', expectVisible: false },
        { role: 'contributor', expectVisible: false },
        { role: 'subscriber', expectVisible: false },
      ];

      for (const c of cases) {
        const principal = await makeUser(app, c.role, `${c.role}M`);
        const get = await app.inject({
          method: 'GET',
          url: `/api/admin/posts/${draft.id}`,
          headers: readHeaders(principal.cookieHeader),
        });
        if (c.role === 'subscriber') {
          expect(get.statusCode).toBe(403);
        } else {
          expect(get.statusCode).toBe(c.expectVisible ? 200 : 404);
        }
      }
    });
  });
});
