import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  getSession,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Array<{ path: string; message: string }>;
  };
}

interface AdminUserShape {
  id: string;
  username: string;
  role: string;
  status: string;
  createdAt: string;
  postCount: number;
  passwordHash?: unknown;
}

interface ProfileShape {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  passwordHash?: unknown;
}

interface UserListShape {
  items: AdminUserShape[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

describe('users administration + profile', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let adminCsrf: string;
  let adminId: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = session.cookieHeader;
    adminCsrf = session.csrfToken;

    const profile = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { cookie: adminCookie },
    });
    adminId = (profile.json() as ProfileShape).id;
  });

  afterEach(async () => {
    await app.close();
  });

  function headers(cookie: string, csrfToken: string): Record<string, string> {
    return {
      cookie,
      'x-csrf-token': csrfToken,
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
    };
  }

  function adminHeaders(): Record<string, string> {
    return headers(adminCookie, adminCsrf);
  }

  // Fastify rejects an empty body when content-type is application/json, so
  // DELETE requests carry auth + CSRF + Origin but no content-type.
  function deleteHeaders(): Record<string, string> {
    return {
      cookie: adminCookie,
      'x-csrf-token': adminCsrf,
      origin: ADMIN_ORIGIN,
    };
  }

  async function createUser(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/users',
      headers: adminHeaders(),
      payload,
    });
  }

  async function loginEditor(username: string, password: string) {
    const session = await loginAs(app, username, password);
    expect(session.response.statusCode).toBe(200);
    return session;
  }

  describe('authentication', () => {
    it('rejects anonymous access to user administration and profile with 401', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/users' });
      expect(list.statusCode).toBe(401);
      expect((list.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');

      const profile = await app.inject({ method: 'GET', url: '/api/profile' });
      expect(profile.statusCode).toBe(401);
      expect((profile.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');

      const create = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
        payload: { username: 'anon', password: 'Anon password 1234', role: 'editor' },
      });
      expect(create.statusCode).toBe(401);
      expect((create.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('authorization', () => {
    it('returns 403 FORBIDDEN for a non-administrator on admin routes but allows own profile', async () => {
      const editor = await seedUser(app, {
        username: 'editor-one',
        password: 'Editor password 123',
        role: 'editor',
      });
      const session = await loginEditor('editor-one', 'Editor password 123');
      const editorHeaders = headers(session.cookieHeader, session.csrfToken);

      const list = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { cookie: session.cookieHeader },
      });
      expect(list.statusCode).toBe(403);
      expect((list.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');

      const create = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: editorHeaders,
        payload: { username: 'sneaky', password: 'Sneaky password 1234', role: 'editor' },
      });
      expect(create.statusCode).toBe(403);
      expect((create.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');

      const profile = await app.inject({
        method: 'GET',
        url: '/api/profile',
        headers: { cookie: session.cookieHeader },
      });
      expect(profile.statusCode).toBe(200);
      expect((profile.json() as ProfileShape).id).toBe(editor.id);
    });
  });

  describe('list and create', () => {
    it('lists users without password hashes and reports post counts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as UserListShape;
      expect(body.pagination.total).toBe(1);
      const admin = body.items.find((item) => item.id === adminId);
      expect(admin?.username).toBe(ADMIN_USERNAME);
      expect(admin?.role).toBe('administrator');
      expect(admin?.status).toBe('active');
      expect(admin?.postCount).toBe(0);
      expect(admin).not.toHaveProperty('passwordHash');
    });

    it('creates a user with 201 and no secret fields, then lists it', async () => {
      const response = await createUser({
        username: 'writer-one',
        password: 'Writer password 123',
        role: 'author',
      });

      expect(response.statusCode).toBe(201);
      const created = response.json() as AdminUserShape;
      expect(created.username).toBe('writer-one');
      expect(created.role).toBe('author');
      expect(created.status).toBe('active');
      expect(created.postCount).toBe(0);
      expect(created).not.toHaveProperty('passwordHash');

      const list = await app.inject({
        method: 'GET',
        url: '/api/users?search=writer',
        headers: { cookie: adminCookie },
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as UserListShape;
      expect(body.pagination.total).toBe(1);
      expect(body.items[0]?.username).toBe('writer-one');
    });

    it('rejects a duplicate username with 409 USERNAME_TAKEN', async () => {
      const response = await createUser({
        username: ADMIN_USERNAME,
        password: 'Duplicate password 123',
        role: 'editor',
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('USERNAME_TAKEN');
    });

    it('rejects a short password with 400 WEAK_PASSWORD', async () => {
      const response = await createUser({
        username: 'short-pass',
        password: 'short',
        role: 'editor',
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('WEAK_PASSWORD');
    });

    it('rejects an unknown role with 400 VALIDATION_ERROR', async () => {
      const response = await createUser({
        username: 'bad-role',
        password: 'Bad role password 123',
        role: 'owner',
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 USER_NOT_FOUND for an unknown user id', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/users/00000000-0000-4000-8000-000000000000/role',
        headers: adminHeaders(),
        payload: { role: 'editor' },
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ErrorEnvelope).error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('administrator safety guards', () => {
    it('refuses changing your own role with 409 SELF_ROLE_CHANGE when another admin exists', async () => {
      const secondAdmin = await createUser({
        username: 'second-admin',
        password: 'Second admin password 1',
        role: 'administrator',
      });
      expect(secondAdmin.statusCode).toBe(201);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${adminId}/role`,
        headers: adminHeaders(),
        payload: { role: 'editor' },
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('SELF_ROLE_CHANGE');
    });

    it('refuses deleting your own account with 409 SELF_DELETE when another admin exists', async () => {
      const secondAdmin = await createUser({
        username: 'second-admin',
        password: 'Second admin password 1',
        role: 'administrator',
      });
      expect(secondAdmin.statusCode).toBe(201);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/users/${adminId}`,
        headers: deleteHeaders(),
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('SELF_DELETE');
    });

    it('refuses demoting, disabling and deleting the last active administrator', async () => {
      const demote = await app.inject({
        method: 'PUT',
        url: `/api/users/${adminId}/role`,
        headers: adminHeaders(),
        payload: { role: 'editor' },
      });
      expect(demote.statusCode).toBe(409);
      expect((demote.json() as ErrorEnvelope).error.code).toBe('LAST_ADMIN');

      const disable = await app.inject({
        method: 'PUT',
        url: `/api/users/${adminId}/status`,
        headers: adminHeaders(),
        payload: { status: 'disabled' },
      });
      expect(disable.statusCode).toBe(409);
      expect((disable.json() as ErrorEnvelope).error.code).toBe('LAST_ADMIN');

      const remove = await app.inject({
        method: 'DELETE',
        url: `/api/users/${adminId}`,
        headers: deleteHeaders(),
      });
      expect(remove.statusCode).toBe(409);
      expect((remove.json() as ErrorEnvelope).error.code).toBe('LAST_ADMIN');

      // The administrator is still active and able to act.
      const stillThere = await app.database.user.findUnique({ where: { id: adminId } });
      expect(stillThere?.role).toBe('administrator');
      expect(stillThere?.status).toBe('active');
    });
  });

  describe('status and password reset', () => {
    it('disables a user and invalidates their sessions', async () => {
      const created = await createUser({
        username: 'disable-me',
        password: 'Disable password 123',
        role: 'editor',
      });
      expect(created.statusCode).toBe(201);
      const target = created.json() as AdminUserShape;

      const session = await loginEditor('disable-me', 'Disable password 123');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${target.id}/status`,
        headers: adminHeaders(),
        payload: { status: 'disabled' },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as AdminUserShape).status).toBe('disabled');

      const oldSession = await getSession(app, session.cookieHeader);
      expect(oldSession.statusCode).toBe(401);

      const relogin = await loginAs(app, 'disable-me', 'Disable password 123');
      expect(relogin.response.statusCode).toBe(401);
    });

    it('resets a user password and invalidates their existing sessions', async () => {
      const created = await createUser({
        username: 'reset-me',
        password: 'Original password 1',
        role: 'editor',
      });
      expect(created.statusCode).toBe(201);
      const target = created.json() as AdminUserShape;

      const session = await loginEditor('reset-me', 'Original password 1');

      const reset = await app.inject({
        method: 'PUT',
        url: `/api/users/${target.id}/password`,
        headers: adminHeaders(),
        payload: { password: 'Replacement password 2' },
      });
      expect(reset.statusCode).toBe(204);

      const oldSession = await getSession(app, session.cookieHeader);
      expect(oldSession.statusCode).toBe(401);

      const relogin = await loginAs(app, 'reset-me', 'Replacement password 2');
      expect(relogin.response.statusCode).toBe(200);
    });

    it('rejects resetting to a weak password with 400 WEAK_PASSWORD', async () => {
      const created = await createUser({
        username: 'weak-reset',
        password: 'Weak reset password 1',
        role: 'editor',
      });
      const target = created.json() as AdminUserShape;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${target.id}/password`,
        headers: adminHeaders(),
        payload: { password: 'short' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('WEAK_PASSWORD');
    });
  });

  describe('self-service profile', () => {
    it('reads and updates the own profile, enforcing username uniqueness', async () => {
      await seedUser(app, {
        username: 'profile-user',
        password: 'Profile password 123',
        role: 'contributor',
      });
      const session = await loginEditor('profile-user', 'Profile password 123');
      const ownHeaders = headers(session.cookieHeader, session.csrfToken);

      const read = await app.inject({
        method: 'GET',
        url: '/api/profile',
        headers: { cookie: session.cookieHeader },
      });
      expect(read.statusCode).toBe(200);
      const profile = read.json() as ProfileShape;
      expect(profile.username).toBe('profile-user');
      expect(profile.role).toBe('contributor');
      expect(profile).not.toHaveProperty('passwordHash');

      const update = await app.inject({
        method: 'PUT',
        url: '/api/profile',
        headers: ownHeaders,
        payload: { username: 'profile-renamed' },
      });
      expect(update.statusCode).toBe(200);
      expect((update.json() as ProfileShape).username).toBe('profile-renamed');
      expect((update.json() as ProfileShape).role).toBe('contributor');

      const duplicate = await app.inject({
        method: 'PUT',
        url: '/api/profile',
        headers: ownHeaders,
        payload: { username: ADMIN_USERNAME },
      });
      expect(duplicate.statusCode).toBe(409);
      expect((duplicate.json() as ErrorEnvelope).error.code).toBe('USERNAME_TAKEN');

      const invalid = await app.inject({
        method: 'PUT',
        url: '/api/profile',
        headers: ownHeaders,
        payload: { username: 'x' },
      });
      expect(invalid.statusCode).toBe(400);
      expect((invalid.json() as ErrorEnvelope).error.code).toBe('INVALID_USERNAME');
    });

    it('changes the own password: wrong current is 400 and the new password works', async () => {
      await seedUser(app, {
        username: 'change-pass',
        password: 'Current password 123',
        role: 'author',
      });
      const session = await loginEditor('change-pass', 'Current password 123');
      const ownHeaders = headers(session.cookieHeader, session.csrfToken);

      const wrong = await app.inject({
        method: 'PUT',
        url: '/api/profile/password',
        headers: ownHeaders,
        payload: { currentPassword: 'not-my-password', newPassword: 'Next password 1234' },
      });
      expect(wrong.statusCode).toBe(400);
      expect((wrong.json() as ErrorEnvelope).error.code).toBe('INVALID_PASSWORD');

      const weak = await app.inject({
        method: 'PUT',
        url: '/api/profile/password',
        headers: ownHeaders,
        payload: { currentPassword: 'Current password 123', newPassword: 'short' },
      });
      expect(weak.statusCode).toBe(400);
      expect((weak.json() as ErrorEnvelope).error.code).toBe('WEAK_PASSWORD');

      const changed = await app.inject({
        method: 'PUT',
        url: '/api/profile/password',
        headers: ownHeaders,
        payload: { currentPassword: 'Current password 123', newPassword: 'Next password 1234' },
      });
      expect(changed.statusCode).toBe(204);

      // All sessions are invalidated (documented choice: the route principal has
      // no session id, so the current session cannot be preserved).
      const oldSession = await getSession(app, session.cookieHeader);
      expect(oldSession.statusCode).toBe(401);

      const relogin = await loginAs(app, 'change-pass', 'Next password 1234');
      expect(relogin.response.statusCode).toBe(200);

      const oldPassword = await loginAs(app, 'change-pass', 'Current password 123');
      expect(oldPassword.response.statusCode).toBe(401);
    });
  });

  describe('delete with reassignment', () => {
    it('requires reassignment for a user with posts, then moves the posts and deletes', async () => {
      const created = await createUser({
        username: 'writer-with-posts',
        password: 'Writer posts password 1',
        role: 'author',
      });
      expect(created.statusCode).toBe(201);
      const target = created.json() as AdminUserShape;

      const authorSession = await loginEditor('writer-with-posts', 'Writer posts password 1');
      const postResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/posts',
        headers: headers(authorSession.cookieHeader, authorSession.csrfToken),
        payload: { type: 'post', title: 'Authored by the deleted user' },
      });
      expect(postResponse.statusCode).toBe(201);
      const postId = (postResponse.json() as { id: string }).id;

      const withoutReassign = await app.inject({
        method: 'DELETE',
        url: `/api/users/${target.id}`,
        headers: deleteHeaders(),
      });
      expect(withoutReassign.statusCode).toBe(409);
      expect((withoutReassign.json() as ErrorEnvelope).error.code).toBe('REASSIGN_REQUIRED');

      const withReassign = await app.inject({
        method: 'DELETE',
        url: `/api/users/${target.id}?reassignTo=${adminId}`,
        headers: deleteHeaders(),
      });
      expect(withReassign.statusCode).toBe(204);

      const post = await app.database.post.findUnique({ where: { id: postId } });
      expect(post?.authorId).toBe(adminId);

      const deleted = await app.database.user.findUnique({ where: { id: target.id } });
      expect(deleted).toBeNull();

      const sessions = await app.database.session.count({ where: { userId: target.id } });
      expect(sessions).toBe(0);
    });

    it('returns 404 for deleting an unknown user', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/00000000-0000-4000-8000-000000000000',
        headers: deleteHeaders(),
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ErrorEnvelope).error.code).toBe('USER_NOT_FOUND');
    });
  });
});
