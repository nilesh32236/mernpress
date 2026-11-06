import type { FastifyInstance } from 'fastify';
import { createAnalyticsService } from '@mernpress/cms-core';
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

interface SummaryShape {
  days: number;
  totalViews: number;
  uniquePaths: number;
  daily: Array<{ day: string; views: number }>;
  topPaths: Array<{ path: string; views: number }>;
  topReferrers: Array<{ host: string; views: number }>;
  vitals: Array<{
    metric: string;
    label: string;
    p75: number | null;
    rating: string | null;
    samples: number;
  }>;
}

describe('privacy-first analytics', () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
  });

  afterEach(async () => {
    await app.close();
  });

  function beacon(payload: Record<string, unknown> | string, userAgent = 'Mozilla/5.0 Test') {
    return app.inject({
      method: 'POST',
      url: '/api/public/views',
      headers: {
        origin: ADMIN_ORIGIN,
        'content-type': 'application/json',
        'user-agent': userAgent,
      },
      payload,
    });
  }

  async function summary(days = 7, headers: Record<string, string> = { cookie }) {
    return app.inject({
      method: 'GET',
      url: `/api/admin/analytics?days=${days}`,
      headers,
    });
  }

  it('aggregates views by path and referrer host only', async () => {
    expect(
      (await beacon({ path: '/hello?utm=x#top', referrer: 'https://example.com/a' })).statusCode,
    ).toBe(204);
    await beacon({ path: '/hello', referrer: 'https://example.com/b' });
    await beacon({ path: '/hello', referrer: null });
    await beacon({ path: '/about' });
    await beacon({ path: '/blog//post/' });

    // Excluded paths never create rows.
    await beacon({ path: '/api/admin/posts' });
    await beacon({ path: '/admin/settings' });
    await beacon({ path: '/favicon.ico' });
    // Bot user agents are ignored.
    await beacon({ path: '/bot-page' }, 'Googlebot/2.1');

    const response = await summary(7);
    expect(response.statusCode).toBe(200);
    const data = response.json() as SummaryShape;
    expect(data.totalViews).toBe(5);
    expect(data.uniquePaths).toBe(3);
    expect(data.daily).toHaveLength(7);
    expect(data.daily.at(-1)?.views).toBe(5);
    expect(data.topPaths).toEqual([
      { path: '/hello', views: 3 },
      { path: '/about', views: 1 },
      { path: '/blog/post', views: 1 },
    ]);
    expect(data.topReferrers).toEqual([{ host: 'example.com', views: 2 }]);
  });

  it('honours the window and validates the range', async () => {
    await beacon({ path: '/today' });

    const thirty = (await summary(30)).json() as SummaryShape;
    expect(thirty.days).toBe(30);
    expect(thirty.daily).toHaveLength(30);
    expect(thirty.totalViews).toBe(1);

    expect((await summary(0)).statusCode).toBe(400);
    expect((await summary(366)).statusCode).toBe(400);
    expect((await summary(7, {})).statusCode).toBe(401);

    await seedUser(app, {
      username: 'analytics-subscriber',
      password: 'Subscriber-pass-2026!',
      role: 'subscriber',
    });
    const subscriber = await loginAs(app, 'analytics-subscriber', 'Subscriber-pass-2026!');
    expect((await summary(7, { cookie: subscriber.cookieHeader })).statusCode).toBe(403);
  });

  it('ignores malformed and empty beacons without recording', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/public/views',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: '{not json',
    });
    // Fastify rejects malformed JSON before the handler; it is never recorded.
    expect(malformed.statusCode).toBe(400);

    const empty = await beacon({ path: '' });
    expect(empty.statusCode).toBe(204);
    expect((await summary()).json()).toMatchObject({ totalViews: 0, topPaths: [] });
  });
  it('prunes aggregate rows outside the retention window', async () => {
    const day = (offset: number) => {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    };
    await app.database.analyticsDaily.createMany({
      data: [
        { day: day(0), path: '/today', referrerHost: '', views: 2 },
        { day: day(5), path: '/five', referrerHost: '', views: 1 },
        { day: day(10), path: '/ten', referrerHost: '', views: 1 },
      ],
    });

    const seven = await app.analytics.prune(7);
    expect(seven).toMatchObject({ pruned: 1, vitalsPruned: 0, retentionDays: 7 });
    expect(seven.cutoffDay).toEqual(expect.any(String));
    let rows = await app.database.analyticsDaily.findMany({ orderBy: { path: 'asc' } });
    expect(rows.map((row) => row.path)).toEqual(['/five', '/today']);

    // 0 disables the sweep.
    expect((await app.analytics.prune(0)).pruned).toBe(0);
    expect(await app.database.analyticsDaily.count()).toBe(2);

    // Keeping only today removes everything older.
    expect((await app.analytics.prune(1)).pruned).toBe(1);
    rows = await app.database.analyticsDaily.findMany();
    expect(rows.map((row) => row.path)).toEqual(['/today']);
  });

  it('validates the retention option and stores a valid window', async () => {
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const headers = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
    const valid = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'privacy', values: { analytics_retention_days: 30 } },
    });
    expect(valid.statusCode).toBe(200);
    expect((valid.json() as { analytics_retention_days: number }).analytics_retention_days).toBe(
      30,
    );

    for (const value of [-1, 3651, 1.5, 'x']) {
      const invalid = await app.inject({
        method: 'PUT',
        url: '/api/options',
        headers,
        payload: { group: 'privacy', values: { analytics_retention_days: value } },
      });
      expect(invalid.statusCode, JSON.stringify(value)).toBe(400);
    }
  });
  it('keeps exactly the last N calendar days with an injected clock', async () => {
    const fixed = new Date('2026-11-06T12:00:00.000Z');
    const analytics = createAnalyticsService({
      prisma: app.database,
      now: () => fixed,
    });
    const day = (offset: number) => new Date(Date.UTC(2026, 10, 6 - offset));
    await app.database.analyticsDaily.createMany({
      data: [
        { day: day(0), path: '/today', referrerHost: '', views: 1 },
        { day: day(6), path: '/boundary-kept', referrerHost: '', views: 1 },
        { day: day(7), path: '/boundary-old', referrerHost: '', views: 1 },
      ],
    });

    const result = await analytics.prune(7);
    expect(result).toEqual({
      pruned: 1,
      vitalsPruned: 0,
      retentionDays: 7,
      cutoffDay: '2026-10-31',
    });
    const rows = await app.database.analyticsDaily.findMany({ orderBy: { path: 'asc' } });
    expect(rows.map((row) => row.path)).toEqual(['/boundary-kept', '/today']);
  });

  function vitalBeacon(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/public/vitals',
      headers: {
        origin: ADMIN_ORIGIN,
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 Test',
        ...headers,
      },
      payload,
    });
  }

  it('aggregates field vitals into daily buckets and reports p75 with ratings', async () => {
    for (const value of [1200, 1800, 2000, 2600]) {
      expect((await vitalBeacon({ metric: 'lcp', value })).statusCode).toBe(204);
    }
    // CLS arrives as a unitless score and is stored as milli-score; three small
    // shifts plus one large one still put p75 in the good bucket.
    for (const value of [0.05, 0.05, 0.05, 0.32]) {
      await vitalBeacon({ metric: 'cls', value });
    }

    // Malformed, unknown and out-of-range samples are ignored.
    expect((await vitalBeacon({ metric: 'fid', value: 100 })).statusCode).toBe(204);
    expect((await vitalBeacon({ metric: 'lcp', value: -1 })).statusCode).toBe(204);
    expect((await vitalBeacon({ metric: 'lcp', value: 999999 })).statusCode).toBe(204);
    expect((await vitalBeacon({ metric: 'lcp' })).statusCode).toBe(204);
    // DNT and bots are never stored.
    expect((await vitalBeacon({ metric: 'lcp', value: 1500 }, { dnt: '1' })).statusCode).toBe(204);
    await app.inject({
      method: 'POST',
      url: '/api/public/vitals',
      headers: {
        origin: ADMIN_ORIGIN,
        'content-type': 'application/json',
        'user-agent': 'Googlebot/2.1',
      },
      payload: { metric: 'lcp', value: 900 },
    });

    const data = (await summary()).json() as SummaryShape;
    const lcp = data.vitals.find((entry) => entry.metric === 'lcp');
    expect(lcp).toMatchObject({
      label: 'Largest Contentful Paint',
      p75: 2000,
      rating: 'good',
      samples: 4,
    });
    const cls = data.vitals.find((entry) => entry.metric === 'cls');
    expect(cls).toMatchObject({ p75: 50, rating: 'good', samples: 4 });
    expect(data.vitals.map((entry) => entry.metric)).toEqual(['lcp', 'inp', 'cls', 'fcp', 'ttfb']);
    expect(data.vitals.find((entry) => entry.metric === 'inp')).toMatchObject({
      p75: null,
      rating: null,
      samples: 0,
    });

    // p75 crosses the good boundary but stays under the poor one.
    for (const value of [3200, 3500, 3800, 4000]) {
      await vitalBeacon({ metric: 'lcp', value });
    }
    const after = (await summary()).json() as SummaryShape;
    expect(after.vitals.find((entry) => entry.metric === 'lcp')).toMatchObject({
      p75: 4000,
      rating: 'needs-improvement',
      samples: 8,
    });
  });

  it('prunes web-vital buckets with the same retention window', async () => {
    const day = (offset: number) => {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    };
    await app.database.webVitalDaily.createMany({
      data: [
        { day: day(0), metric: 'lcp', bucket: 2000, count: 3 },
        { day: day(9), metric: 'lcp', bucket: 3000, count: 2 },
      ],
    });
    const result = await app.analytics.prune(7);
    expect(result).toMatchObject({ pruned: 0, vitalsPruned: 1, retentionDays: 7 });
    const remaining = await app.database.webVitalDaily.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.bucket).toBe(2000);
  });
});
