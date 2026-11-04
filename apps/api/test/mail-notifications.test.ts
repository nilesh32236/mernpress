import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from './helpers/auth.js';

interface PostShape {
  id: string;
  version: number;
}

interface CommentShape {
  status: string;
}

describe('comment and new-user mail notifications', () => {
  let app: FastifyInstance;
  let cookie: string;
  let csrf: string;

  async function resetMailApp(): Promise<void> {
    app = await createTestApp({ MAIL_TRANSPORT: 'memory' });
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    csrf = session.csrfToken;
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
  }

  beforeEach(async () => {
    await resetMailApp();
  });

  afterEach(async () => {
    await app.close();
  });

  function headers(): Record<string, string> {
    return {
      origin: ADMIN_ORIGIN,
      cookie,
      'x-csrf-token': csrf,
      'content-type': 'application/json',
    };
  }

  async function setDiscussion(values: Record<string, unknown>): Promise<void> {
    const current = await app.inject({
      method: 'GET',
      url: '/api/options?group=discussion',
      headers: { cookie },
    });
    const response = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers: headers(),
      payload: {
        group: 'discussion',
        values: { ...(current.json() as object), ...values },
      },
    });
    expect(response.statusCode).toBe(200);
  }

  async function publishedPost(title: string): Promise<PostShape> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: headers(),
      payload: { type: 'post', title },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as PostShape;
    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers: headers(),
      payload: { baseVersion: post.version },
    });
    expect(published.statusCode).toBe(200);
    return post;
  }

  async function addComment(
    postId: string,
    content: string,
    authorEmail = 'reader@example.com',
  ): Promise<CommentShape> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/public/posts/${postId}/comments`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: {
        authorName: 'Reader',
        authorEmail,
        content,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as CommentShape;
  }

  it('emails the post author when an approved comment is published', async () => {
    await setDiscussion({ comment_moderation: false, comment_previously_approved: false });
    const post = await publishedPost('Notification target');
    const comment = await addComment(post.id, 'A genuinely useful comment.');
    expect(comment.status).toBe('APPROVED');

    expect(app.mail.status()).toMatchObject({ configured: true, transport: 'memory' });
    expect(app.mail.outbox).toHaveLength(1);
    const message = app.mail.outbox[0]!;
    expect(message.to).toBe('admin@example.com');
    expect(message.subject).toContain('New comment on "Notification target"');
    expect(message.text).toContain('A genuinely useful comment.');
    expect(message.text).toContain('/admin/comments');
  });

  it('emails the administration address when a comment is held for moderation', async () => {
    await setDiscussion({ comment_moderation: true });
    const post = await publishedPost('Moderated post');
    const comment = await addComment(post.id, 'Please moderate me.');
    expect(comment.status).toBe('PENDING');

    expect(app.mail.outbox).toHaveLength(1);
    const message = app.mail.outbox[0]!;
    expect(message.to).toBe('admin@example.com');
    expect(message.subject).toContain('Please moderate: "Moderated post"');
    expect(message.text).toContain('waiting for your approval');
    expect(message.text).toContain('/admin/comments?status=PENDING');
  });

  it('honours the notification preferences', async () => {
    await setDiscussion({
      comment_moderation: true,
      moderation_notify: false,
      comments_notify: false,
      comment_previously_approved: false,
    });
    const post = await publishedPost('Quiet post');
    const pending = await addComment(post.id, 'No mail expected.', 'quiet-1@example.com');
    expect(pending.status).toBe('PENDING');
    expect(app.mail.outbox).toHaveLength(0);

    await setDiscussion({ comment_moderation: false });
    const approved = await addComment(post.id, 'Still no mail expected.', 'quiet-2@example.com');
    expect(approved.status).toBe('APPROVED');
    expect(app.mail.outbox).toHaveLength(0);
  });

  it('sends the new-user notification and reports the mail status', async () => {
    const status = await app.inject({
      method: 'GET',
      url: '/api/admin/mail/status',
      headers: { cookie },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ configured: true, transport: 'memory' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: headers(),
      payload: {
        username: 'mail-invitee',
        password: 'Invitee-pass-2026!',
        role: 'author',
        email: 'invitee@example.com',
        sendNotification: true,
      },
    });
    expect(created.statusCode).toBe(201);

    expect(app.mail.outbox).toHaveLength(1);
    const message = app.mail.outbox[0]!;
    expect(message.to).toBe('invitee@example.com');
    expect(message.subject).toContain('Your new account');
    expect(message.text).toContain('Username: mail-invitee');
    expect(message.text).toContain('https://mernpress.example/admin/');
  });

  it('rejects a notification request when no mail transport is configured', async () => {
    await app.close();
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    csrf = session.csrfToken;

    const status = await app.inject({
      method: 'GET',
      url: '/api/admin/mail/status',
      headers: { cookie },
    });
    expect(status.json()).toMatchObject({ configured: false, transport: null });

    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: headers(),
      payload: {
        username: 'mail-invitee',
        password: 'Invitee-pass-2026!',
        role: 'author',
        email: 'invitee@example.com',
        sendNotification: true,
      },
    });
    expect(created.statusCode).toBe(400);
    expect((created.json() as { error: { code: string } }).error.code).toBe('MAIL_NOT_CONFIGURED');
    const users = await app.database.user.findFirst({ where: { username: 'mail-invitee' } });
    expect(users).toBeNull();
  });
  it('addresses the approved-comment email to the post author when known', async () => {
    await setDiscussion({ comment_moderation: false, comment_previously_approved: false });
    const admin = await app.database.user.findUniqueOrThrow({
      where: { username: ADMIN_USERNAME },
    });
    await app.database.user.update({
      where: { id: admin.id },
      data: { email: 'post-author@example.com' },
    });
    const post = await publishedPost('Author-addressed post');
    await addComment(post.id, 'Author should receive this.', 'author-reader@example.com');

    expect(app.mail.outbox).toHaveLength(1);
    expect(app.mail.outbox[0]!.to).toBe('post-author@example.com');
  });
});
