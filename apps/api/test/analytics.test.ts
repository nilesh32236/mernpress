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

interface SummaryShape {
  days: number;
  totalViews: number;
  uniquePaths: number;
  daily: Array<{ day: string; views: number }>;
  topPaths: Array<{ path: string; views: number }>;
  topReferrers: Array<{ host: string; views: number }>;
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
});
