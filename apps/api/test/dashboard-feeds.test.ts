import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDashboardFeedService, parseRssItems } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

let app: FastifyInstance;

beforeEach(async () => {
  // Keep the route tests off the public network: unreachable local endpoints
  // exercise the configured/error paths deterministically.
  app = await createTestApp({
    EVENTS_API_URL: 'http://127.0.0.1:9/events',
    NEWS_FEED_URL: 'http://127.0.0.1:9/news',
  });
  await seedAdmin(app);
});

afterEach(async () => {
  await app.close();
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[WordPress 7.2 Beta 4]]></title><link>https://wordpress.org/news/2026/11/beta/</link><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate></item>
<item><title>Security &amp; maintenance</title><link>https://wordpress.org/news/2026/10/security/</link><pubDate>Wed, 28 Oct 2026 10:00:00 +0000</pubDate></item>
<item><title>Broken</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

describe('dashboard feed parsing', () => {
  it('parses RSS titles, links and dates and rejects non-http links', () => {
    const items = parseRssItems(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'WordPress 7.2 Beta 4',
      url: 'https://wordpress.org/news/2026/11/beta/',
    });
    expect(items[1]?.title).toBe('Security & maintenance');
    expect(items[0]?.publishedAt).toBe('2026-11-03T10:00:00.000Z');
  });

  it('loads events and news, requires a location, and reuses the news cache', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/events')) {
        return new Response(
          JSON.stringify({
            error: null,
            events: [
              {
                title: 'WordCamp Manchester 2026',
                url: 'https://manchester.wordcamp.org/2026/',
                date: '2026-11-06 00:00:00',
                location: { location: 'Manchester, UK' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(RSS, { status: 200 });
    }) as typeof fetch;

    const service = createDashboardFeedService({
      prisma: app.database,
      fetchImpl,
      now: () => new Date('2026-11-04T10:00:00.000Z'),
    });

    const withoutLocation = await service.load('');
    expect(withoutLocation.events).toEqual([]);
    expect(withoutLocation.eventsError).toBe('Choose a location to see nearby events.');

    const manchester = await service.load('Manchester');
    expect(manchester.events).toHaveLength(1);
    expect(manchester.events[0]).toMatchObject({
      title: 'WordCamp Manchester 2026',
      location: 'Manchester, UK',
    });
    expect(manchester.news).toHaveLength(2);

    const newsCallsBefore = urls.filter((url) => url.includes('/news')).length;
    const london = await service.load('London');
    expect(london.news).toHaveLength(2);
    // News is location-independent: only the events endpoint is hit again.
    expect(urls.filter((url) => url.includes('/news')).length).toBe(newsCallsBefore);
    expect(urls.some((url) => url.includes('location=London'))).toBe(true);
  });

  it('does not cache failures, so a retry can recover', async () => {
    let fail = true;
    const service = createDashboardFeedService({
      prisma: app.database,
      fetchImpl: (async () => {
        if (fail) throw new Error('network');
        return new Response(RSS, { status: 200 });
      }) as typeof fetch,
    });
    const first = await service.load('Manchester');
    expect(first.newsError).toBe('Could not load news.');
    fail = false;
    const second = await service.load('Manchester');
    expect(second.newsError).toBeNull();
    expect(second.news.length).toBeGreaterThan(0);
  });
});

describe('dashboard feeds route', () => {
  it('returns feeds for a signed-in editor and rejects anonymous callers', async () => {
    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const { cookieHeader } = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/dashboard/feeds',
      headers: { cookie: cookieHeader },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      eventsError: string;
      newsConfigured: boolean;
      news: unknown[];
    };
    expect(body.eventsError).toBe('Choose a location to see nearby events.');
    expect(body.newsConfigured).toBe(true);

    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/dashboard/feeds' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('ignores unknown query parameters', async () => {
    const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/dashboard/feeds?nope=1',
      headers: { cookie: cookieHeader, origin: ADMIN_ORIGIN },
    });
    expect(response.statusCode).toBe(400);
  });
});
