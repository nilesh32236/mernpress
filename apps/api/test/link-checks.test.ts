import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createJobQueueService } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';
import { createJobHandlers } from '../src/jobs/handlers.js';
import { createJobWorker } from '../src/jobs/worker.js';

interface LinkListShape {
  links: Array<{
    id: string;
    sourcePostId: string;
    sourceTitle: string;
    sourceSlug: string;
    url: string;
    kind: string;
    status: string;
    httpStatus: number | null;
    redirectTo: string | null;
  }>;
  summary: {
    total: number;
    ok: number;
    broken: number;
    redirect: number;
    external: number;
    sources: number;
    lastCheckedAt: string | null;
  };
}

describe('broken-link detection', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;
  let cookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    headers = {
      origin: ADMIN_ORIGIN,
      cookie,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app.close();
  });

  function bodyless(): Record<string, string> {
    const { 'content-type': _ct, ...rest } = headers;
    return rest;
  }

  async function createPost(payload: Record<string, unknown>) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json() as { id: string; version: number; slug: string; title: string };
  }

  async function publish(post: { id: string; version: number }) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { id: string; version: number };
  }

  async function createAndPublish(payload: Record<string, unknown>) {
    return publish(await createPost(payload));
  }

  function queue() {
    return createJobQueueService({ prisma: app.database });
  }

  function worker() {
    const jobs = queue();
    return createJobWorker({
      queue: jobs,
      handlers: createJobHandlers({
        prisma: app.database,
        notes: app.notes,
        analytics: app.analytics,
        jobs,
        backups: app.backups,
        media: app.media,
        linkChecks: app.linkChecks,
        mail: app.mail,
        mailSecret: 'test-only-auth-hash-pepper-2026-10-25-0123456789',
      }),
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      workerId: 'link-check-test',
    });
  }

  it('detects broken, ok, redirect and external links without fetching external URLs', async () => {
    await app.database.term.create({
      data: { taxonomy: 'category', name: 'News', slug: 'news-link-check' },
    });
    await createAndPublish({ type: 'post', title: 'Exists post' });
    await createAndPublish({ type: 'page', title: 'Exists page' });
    await app.inject({
      method: 'POST',
      url: '/api/admin/redirects',
      headers,
      payload: { fromPath: '/old-link-target', toPath: '/posts/exists-post' },
    });

    const source = await createAndPublish({
      type: 'post',
      title: 'Source post',
      content: [
        '<a href="/posts/exists-post">ok post</a>',
        '<a href="/exists-page">ok page</a>',
        '<a href="/category/news-link-check">ok term</a>',
        '<a href="/author/admin">ok author</a>',
        '<a href="/">ok home</a>',
        '<a href="/missing-page">broken</a>',
        '<a href="/posts/no-such-post">broken post</a>',
        '<a href="/old-link-target">redirect</a>',
        '<a href="https://external.example.com/page">external</a>',
        '<a href="#local">ignored</a>',
        '<a href="mailto:a@example.com">ignored</a>',
      ].join('\n'),
    });

    const result = await app.linkChecks.checkAllSystem();
    expect(result.processed).toBeGreaterThanOrEqual(3);
    expect(result.broken).toBe(2);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/links',
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as LinkListShape;
    const byUrl = new Map(body.links.map((link) => [link.url, link]));
    expect(byUrl.get('/posts/exists-post')?.status).toBe('ok');
    expect(byUrl.get('/exists-page')?.status).toBe('ok');
    expect(byUrl.get('/category/news-link-check')?.status).toBe('ok');
    expect(byUrl.get('/author/admin')?.status).toBe('ok');
    expect(byUrl.get('/')?.status).toBe('ok');
    expect(byUrl.get('/missing-page')).toMatchObject({ status: 'broken', httpStatus: 404 });
    expect(byUrl.get('/posts/no-such-post')?.status).toBe('broken');
    expect(byUrl.get('/old-link-target')).toMatchObject({
      status: 'redirect',
      redirectTo: '/posts/exists-post',
    });
    expect(byUrl.get('https://external.example.com/page')).toMatchObject({
      kind: 'external',
      status: 'external',
      httpStatus: null,
    });
    expect(byUrl.has('#local')).toBe(false);
    expect(byUrl.has('mailto:a@example.com')).toBe(false);
    expect(body.summary.broken).toBe(2);
    expect(body.summary.external).toBe(1);
    expect(body.summary.sources).toBe(1);
    expect(body.summary.lastCheckedAt).toBeTruthy();
    expect(byUrl.get('/missing-page')?.sourcePostId).toBe(source.id);

    // Re-running upserts instead of duplicating.
    await app.linkChecks.checkAllSystem();
    const again = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/links',
        headers: { cookie },
      })
    ).json() as LinkListShape;
    expect(again.links).toHaveLength(body.links.length);
  });

  it('queues a durable scan job, dedupes it and exposes it through Scheduled Actions', async () => {
    await createAndPublish({
      type: 'post',
      title: 'Link source',
      content: '<a href="/gone">broken</a>',
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/links/check',
      headers: bodyless(),
    });
    expect(created.statusCode).toBe(202);
    const queued = created.json() as { job: { id: string; status: string } };
    expect(queued.job.status).toBe('PENDING');

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/admin/links/check',
      headers: bodyless(),
    });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: { code: string } }).error.code).toBe(
      'LINK_CHECK_IN_PROGRESS',
    );

    const ticked = await worker().tick();
    expect(ticked).toMatchObject({ claimed: 1, completed: 1, failed: 0 });

    const job = await app.inject({
      method: 'GET',
      url: `/api/admin/jobs/${queued.job.id}`,
      headers: { cookie },
    });
    expect((job.json() as { status: string }).status).toBe('COMPLETED');

    const listed = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/links',
        headers: { cookie },
      })
    ).json() as LinkListShape;
    expect(listed.summary.broken).toBe(1);
    expect(listed.links[0]?.url).toBe('/gone');
  });

  it('dismisses a check and purges rows when the link disappears', async () => {
    const source = await createAndPublish({
      type: 'post',
      title: 'Evolving source',
      content: '<a href="/stale-link">stale</a>',
    });
    await app.linkChecks.checkAllSystem();
    let listed = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/links',
        headers: { cookie },
      })
    ).json() as LinkListShape;
    expect(listed.summary.broken).toBe(1);
    const row = listed.links[0]!;

    // Removing the link from the source clears the row on the next scan.
    await app.database.post.update({
      where: { id: source.id },
      data: { content: '<p>No links.</p>' },
    });
    await app.linkChecks.checkAllSystem();
    listed = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/links',
        headers: { cookie },
      })
    ).json() as LinkListShape;
    expect(listed.links).toHaveLength(0);

    // Orphan rows for unpublished sources are purged.
    const orphan = await createAndPublish({
      type: 'post',
      title: 'Doomed source',
      content: '<a href="/orphan">orphan</a>',
    });
    await app.linkChecks.checkAllSystem();
    expect(await app.database.linkCheck.count()).toBe(1);
    await app.database.post.delete({ where: { id: orphan.id } });
    const purged = await app.linkChecks.purgeOrphans();
    expect(purged).toBe(1);
    expect(await app.database.linkCheck.count()).toBe(0);
    expect(row.id).toBeTruthy();
  });

  it('rejects anonymous, non-admin and draft content, and dismiss requires admin', async () => {
    await seedUser(app, {
      username: 'link-subscriber',
      password: 'Subscriber-pass-1!',
      role: 'subscriber',
    });
    const subscriber = await loginAs(app, 'link-subscriber', 'Subscriber-pass-1!');

    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/links', headers: {} })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/links',
          headers: { cookie: subscriber.cookieHeader },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/links/check',
          headers: {
            origin: ADMIN_ORIGIN,
            cookie: subscriber.cookieHeader,
            'x-csrf-token': subscriber.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(403);
    // No job row was created by a forbidden caller.
    expect(await app.database.job.count({ where: { type: 'linkcheck.scan' } })).toBe(0);

    // Drafts are not crawled.
    await createPost({
      type: 'post',
      title: 'Draft source',
      content: '<a href="/draft-only">draft</a>',
    });
    await app.linkChecks.checkAllSystem();
    expect(await app.database.linkCheck.count({ where: { url: '/draft-only' } })).toBe(0);

    // Dismiss a real row as admin, 404 for a missing id, 403 for subscriber.
    await createAndPublish({
      type: 'post',
      title: 'Dismiss source',
      content: '<a href="/dismiss-me">dismiss</a>',
    });
    await app.linkChecks.checkAllSystem();
    const listed = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/links',
        headers: { cookie },
      })
    ).json() as LinkListShape;
    const id = listed.links[0]!.id;
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/admin/links/${id}`,
          headers: {
            origin: ADMIN_ORIGIN,
            cookie: subscriber.cookieHeader,
            'x-csrf-token': subscriber.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/admin/links/${id}`,
          headers: bodyless(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/admin/links/${id}`,
          headers: bodyless(),
        })
      ).statusCode,
    ).toBe(404);
  });

  it('extracts href/src/srcset links in order without duplicates', async () => {
    const { extractLinks } = await import('@mernpress/cms-core');
    const links = extractLinks(
      [
        '<a href="/a">x</a>',
        "<a href='/a'>dup</a>",
        '<img src="/img.webp" srcset="/small.webp 300w, /large.webp 600w" alt="" />',
        '<a href="https://example.com/x?a=1&amp;b=2">amp</a>',
        '<a href="#frag">skip shape but kept</a>',
      ].join('\n'),
    );
    expect(links[0]).toBe('/a');
    expect(links).toContain('/img.webp');
    expect(links).toContain('/small.webp');
    expect(links).toContain('/large.webp');
    expect(links).toContain('https://example.com/x?a=1&b=2');
  });
});
