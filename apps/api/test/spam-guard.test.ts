import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminPost, SpamGuardState } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

const SPAM_CONTENT =
  'CHEAP VIAGRA AND CASINO CHIPS ARE HERE https://spam.example/a https://spam.example/b !!!';
const BORDERLINE_CONTENT =
  'I offer seo services for your website and can help you rank higher in the search results quickly.';
const CLEAN_CONTENT =
  'I enjoyed this article and would like to read more about analytical engines.';

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

async function publishPost(title = 'Spam target'): Promise<AdminPost> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers,
    payload: {
      type: 'post',
      title,
      content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
    },
  });
  expect(created.statusCode).toBe(201);
  const post = created.json() as AdminPost;
  const published = await app.inject({
    method: 'POST',
    url: `/api/admin/posts/${post.id}/publish`,
    headers,
    payload: { baseVersion: post.version },
  });
  expect(published.statusCode).toBe(200);
  return published.json() as AdminPost;
}

async function allowFirstComments(): Promise<void> {
  const response = await app.inject({
    method: 'PUT',
    url: '/api/options',
    headers,
    payload: { group: 'discussion', values: { comment_previously_approved: false } },
  });
  expect(response.statusCode).toBe(200);
}

async function comment(
  postId: string,
  content: string,
  email: string,
  name = 'Commenter',
): Promise<{ statusCode: number; body: { status?: string } }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/public/posts/${postId}/comments`,
    headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
    payload: { authorName: name, authorEmail: email, content },
  });
  return { statusCode: response.statusCode, body: response.json() as { status?: string } };
}

async function putGuard(payload: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: '/api/admin/connectors/spam',
    headers,
    payload,
  });
}

describe('local spam guard', () => {
  it('stores obvious spam in Spam, holds borderline comments and approves clean ones', async () => {
    await allowFirstComments();
    const post = await publishPost();

    const spam = await comment(post.id, SPAM_CONTENT, 'spam@example.com');
    expect(spam.statusCode).toBe(201);
    expect(spam.body.status).toBe('SPAM');

    const borderline = await comment(post.id, BORDERLINE_CONTENT, 'border@example.com');
    expect(borderline.body.status).toBe('PENDING');

    const clean = await comment(post.id, CLEAN_CONTENT, 'reader@example.com');
    expect(clean.body.status).toBe('APPROVED');

    const publicList = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.id}/comments`,
    });
    const items = (publicList.json() as { items: Array<{ content: string }> }).items;
    expect(items.map((item) => item.content)).toEqual([CLEAN_CONTENT]);

    const state = await app.inject({
      method: 'GET',
      url: '/api/admin/connectors/spam',
      headers,
    });
    expect(state.statusCode).toBe(200);
    const body = state.json() as SpamGuardState;
    expect(body.settings).toEqual({
      enabled: true,
      spamThreshold: 6,
      moderationThreshold: 3,
    });
    expect(body.stats).toEqual({ spam: 1, pending: 1, spamLast7Days: 1 });
    expect(body.engine.id).toBe('local-heuristic');
    expect(body.akismet).toMatchObject({ available: false });
    expect(body.akismet.reason).toContain('external service');
  });

  it('honours configured thresholds and can be switched off', async () => {
    await allowFirstComments();
    const post = await publishPost();

    const raised = await putGuard({
      enabled: true,
      spamThreshold: 12,
      moderationThreshold: 10,
    });
    expect(raised.statusCode).toBe(200);
    expect((raised.json() as SpamGuardState).settings).toEqual({
      enabled: true,
      spamThreshold: 12,
      moderationThreshold: 10,
    });

    // 11 points: no longer spam, but still over the moderation threshold.
    const held = await comment(post.id, SPAM_CONTENT, 'held@example.com');
    expect(held.body.status).toBe('PENDING');

    const off = await putGuard({
      enabled: false,
      spamThreshold: 6,
      moderationThreshold: 3,
    });
    expect(off.statusCode).toBe(200);
    const quiet = await comment(post.id, SPAM_CONTENT, 'quiet@example.com');
    // The guard is off; links equal (not exceed) the Discussion link limit and
    // first comments are approved in this test, so the old pipeline runs.
    expect(quiet.body.status).toBe('APPROVED');
  });

  it('validates settings and restricts them to administrators', async () => {
    expect(
      (await putGuard({ enabled: true, spamThreshold: 4, moderationThreshold: 8 })).statusCode,
    ).toBe(400);
    expect(
      (await putGuard({ enabled: true, spamThreshold: 0, moderationThreshold: 0 })).statusCode,
    ).toBe(400);
    expect(
      (await putGuard({ enabled: true, spamThreshold: 21, moderationThreshold: 3 })).statusCode,
    ).toBe(400);
    expect(
      (
        await putGuard({
          enabled: 'yes',
          spamThreshold: 6,
          moderationThreshold: 3,
        })
      ).statusCode,
    ).toBe(400);

    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/admin/connectors/spam',
    });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/connectors/spam',
      headers: { cookie: editor.cookieHeader },
    });
    expect(forbidden.statusCode).toBe(403);
    const forbiddenWrite = await app.inject({
      method: 'PUT',
      url: '/api/admin/connectors/spam',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: editor.cookieHeader,
        'x-csrf-token': editor.csrfToken,
        'content-type': 'application/json',
      },
      payload: { enabled: false, spamThreshold: 6, moderationThreshold: 3 },
    });
    expect(forbiddenWrite.statusCode).toBe(403);
  });
});
