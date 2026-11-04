import type { DatabaseClient } from '@mernpress/database';

/**
 * Dashboard → Events and News.
 *
 * Mirrors WordPress's `dashboard_primary` widget: upcoming events near a
 * location plus the latest news headlines. Both sources are configured
 * services (defaults are the same public WordPress.org endpoints WordPress
 * itself uses), fetched with a short timeout and cached in memory so opening
 * the dashboard repeatedly does not hammer them.
 */
export const DEFAULT_EVENTS_API_URL = 'https://api.wordpress.org/events/1.0/';
export const DEFAULT_NEWS_FEED_URL = 'https://wordpress.org/news/feed/';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_EVENTS = 2;
const MAX_NEWS = 5;
const FETCH_TIMEOUT_MS = 6000;

export interface DashboardEvent {
  title: string;
  url: string;
  location: string;
  date: string;
}

export interface DashboardNews {
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface DashboardFeeds {
  events: DashboardEvent[];
  news: DashboardNews[];
  eventsConfigured: boolean;
  newsConfigured: boolean;
  eventsError: string | null;
  newsError: string | null;
  location: string;
}

export interface DashboardFeedOptions {
  prisma: DatabaseClient;
  eventsUrl?: string | undefined;
  newsUrl?: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface EventsPayload {
  error?: string | null;
  events?: Array<{
    title?: string;
    url?: string;
    date?: string;
    location?: { location?: string } | string;
  }>;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Minimal RSS 2.0 item parser: title, link and pubDate only. */
export function parseRssItems(xml: string, limit = MAX_NEWS): DashboardNews[] {
  const items: DashboardNews[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks.slice(0, limit)) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1];
    const published = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1];
    if (!title || !link) continue;
    const url = decodeEntities(link.trim());
    if (!/^https?:\/\//i.test(url)) continue;
    items.push({
      title: decodeEntities(title.trim()).slice(0, 200),
      url,
      publishedAt: published ? new Date(published.trim()).toISOString() : null,
    });
  }
  return items;
}

export function createDashboardFeedService({
  eventsUrl = DEFAULT_EVENTS_API_URL,
  newsUrl = DEFAULT_NEWS_FEED_URL,
  fetchImpl = fetch,
  now = () => new Date(),
}: DashboardFeedOptions) {
  // News does not depend on the location, so it is cached separately. Failures
  // are never cached: a transient network error must be able to recover.
  const eventsCache = new Map<string, { at: number; events: DashboardEvent[] }>();
  let newsCache: { at: number; news: DashboardNews[] } | null = null;

  async function fetchJson(url: string): Promise<EventsPayload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'MERNPress/0.1 update-check' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return (await response.json()) as EventsPayload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/rss+xml, application/xml, text/xml' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function load(location: string): Promise<DashboardFeeds> {
    const trimmed = location.trim().slice(0, 120);
    const configured = { events: Boolean(eventsUrl), news: Boolean(newsUrl) };
    const result: DashboardFeeds = {
      events: [],
      news: [],
      eventsConfigured: configured.events,
      newsConfigured: configured.news,
      eventsError: null,
      newsError: null,
      location: trimmed,
    };

    await Promise.all([
      (async () => {
        if (!eventsUrl) return;
        // The events service needs a location; asking without one fails at the
        // transport layer rather than returning an empty list.
        if (!trimmed) {
          result.eventsError = 'Choose a location to see nearby events.';
          return;
        }
        const cachedEvents = eventsCache.get(trimmed);
        if (cachedEvents && now().getTime() - cachedEvents.at < CACHE_TTL_MS) {
          result.events = cachedEvents.events;
          return;
        }
        try {
          const url = `${eventsUrl}${eventsUrl.includes('?') ? '&' : '?'}number=${MAX_EVENTS}&location=${encodeURIComponent(trimmed)}`;
          const payload = await fetchJson(url);
          if (payload.error) {
            result.eventsError =
              payload.error === 'no_location_available'
                ? 'Choose a location to see nearby events.'
                : 'Events are unavailable right now.';
            return;
          }
          result.events = (payload.events ?? []).slice(0, MAX_EVENTS).map((event) => ({
            title: String(event.title ?? 'Event').slice(0, 200),
            url: String(event.url ?? ''),
            location:
              typeof event.location === 'string'
                ? event.location
                : String(event.location?.location ?? ''),
            date: String(event.date ?? ''),
          }));
          eventsCache.set(trimmed, { at: now().getTime(), events: result.events });
        } catch {
          result.eventsError = 'Could not load events.';
        }
      })(),
      (async () => {
        if (!newsUrl) return;
        if (newsCache && now().getTime() - newsCache.at < CACHE_TTL_MS) {
          result.news = newsCache.news;
          return;
        }
        try {
          result.news = parseRssItems(await fetchText(newsUrl), MAX_NEWS);
          newsCache = { at: now().getTime(), news: result.news };
        } catch {
          result.newsError = 'Could not load news.';
        }
      })(),
    ]);

    return result;
  }

  return { load };
}

export type DashboardFeedService = ReturnType<typeof createDashboardFeedService>;
