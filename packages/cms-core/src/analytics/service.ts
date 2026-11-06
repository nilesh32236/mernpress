import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import type { Principal } from '../content/types.js';

/**
 * Privacy-first, own-site aggregate analytics.
 *
 * There are no cookies, no visitor ids and no stored IP addresses. One row per
 * (UTC day, path, referrer host) is incremented; the dashboard reads aggregates.
 * The beacon is deliberately simple, so the numbers are directional rather than
 * audited: bots are filtered best-effort, Do-Not-Track is honoured client-side,
 * and server-side API/admin/static paths are never recorded.
 */

const MAX_PATH = 2048;
const MAX_REFERRER_HOST = 255;
const IGNORED_PREFIXES = ['/api', '/admin', '/_next'];
const IGNORED_PATHS = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);
const BOT_AGENT =
  /bot|crawl|spider|slurp|bingpreview|curl|wget|python-requests|facebookexternalhit|preview/i;

export interface RecordViewInput {
  path: string;
  referrer?: string | null | undefined;
  userAgent?: string | null | undefined;
  now?: Date;
}

export interface AnalyticsPruneResult {
  pruned: number;
  /** Effective retention window (0 = disabled). */
  retentionDays: number;
  /** First day kept (`YYYY-MM-DD`), or null when disabled. */
  cutoffDay: string | null;
}

export interface AnalyticsSummary {
  days: number;
  totalViews: number;
  uniquePaths: number;
  /** One entry per day in the window, oldest first, missing days filled with 0. */
  daily: Array<{ day: string; views: number }>;
  topPaths: Array<{ path: string; views: number }>;
  topReferrers: Array<{ host: string; views: number }>;
}

export interface AnalyticsServiceOptions {
  prisma: DatabaseClient;
  now?: () => Date;
}

export function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function normalizeAnalyticsPath(raw: string): string | null {
  let path = raw.split(/[?#]/)[0] ?? '';
  if (!path.startsWith('/')) return null;
  if (path.length > MAX_PATH) return null;
  if (IGNORED_PATHS.has(path)) return null;
  for (const prefix of IGNORED_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return null;
  }
  // Collapse duplicate slashes so `/a//b` and `/a/b` aggregate together.
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

export function referrerHost(referrer: string | null | undefined): string {
  if (!referrer) return '';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.length > MAX_REFERRER_HOST ? '' : host;
  } catch {
    return '';
  }
}

export function createAnalyticsService({
  prisma,
  now = () => new Date(),
}: AnalyticsServiceOptions) {
  async function record(input: RecordViewInput): Promise<boolean> {
    if (input.userAgent && BOT_AGENT.test(input.userAgent)) return false;
    const path = normalizeAnalyticsPath(input.path);
    if (path === null) return false;
    const host = referrerHost(input.referrer);
    const day = utcDay(input.now ?? now());
    await prisma.analyticsDaily.upsert({
      where: { day_path_referrerHost: { day, path, referrerHost: host } },
      create: { day, path, referrerHost: host, views: 1 },
      update: { views: { increment: 1 } },
    });
    return true;
  }

  async function summary(principal: Principal, days = 7): Promise<AnalyticsSummary> {
    requireCapability(principal, 'content.read.any');
    const windowDays = Math.min(365, Math.max(1, Math.trunc(days)));
    const today = utcDay(now());
    const start = new Date(today.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
    const rows = await prisma.analyticsDaily.findMany({
      where: { day: { gte: start } },
      select: { day: true, path: true, referrerHost: true, views: true },
    });

    const daily = new Map<string, number>();
    for (let index = 0; index < windowDays; index += 1) {
      const day = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
      daily.set(day.toISOString().slice(0, 10), 0);
    }
    const paths = new Map<string, number>();
    const referrers = new Map<string, number>();
    let totalViews = 0;
    for (const row of rows) {
      const key = row.day.toISOString().slice(0, 10);
      totalViews += row.views;
      daily.set(key, (daily.get(key) ?? 0) + row.views);
      paths.set(row.path, (paths.get(row.path) ?? 0) + row.views);
      if (row.referrerHost) {
        referrers.set(row.referrerHost, (referrers.get(row.referrerHost) ?? 0) + row.views);
      }
    }

    const rank = (map: Map<string, number>) =>
      [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);

    return {
      days: windowDays,
      totalViews,
      uniquePaths: paths.size,
      daily: [...daily.entries()].map(([day, views]) => ({ day, views })),
      topPaths: rank(paths).map(([path, views]) => ({ path, views })),
      topReferrers: rank(referrers).map(([host, views]) => ({ host, views })),
    };
  }

  /**
   * Retention sweep: delete aggregate rows older than the window. `days` is the
   * number of calendar days to keep including today (1 = today only; 0 or a
   * negative value disables the sweep). Only counts are returned/logged; the
   * table holds no visitor identifiers, so there is nothing else to report.
   */
  async function prune(retentionDays: number): Promise<AnalyticsPruneResult> {
    if (!Number.isFinite(retentionDays)) {
      return { pruned: 0, retentionDays: 0, cutoffDay: null };
    }
    // Keep the invariant in one place even for programmatic callers.
    const days = Math.min(3650, Math.trunc(retentionDays));
    if (days <= 0) {
      return { pruned: 0, retentionDays: days, cutoffDay: null };
    }
    const today = utcDay(now());
    const cutoff = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const result = await prisma.analyticsDaily.deleteMany({
      where: { day: { lt: cutoff } },
    });
    return {
      pruned: result.count,
      retentionDays: days,
      cutoffDay: cutoff.toISOString().slice(0, 10),
    };
  }

  return { record, summary, prune };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
