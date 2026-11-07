import {
  WEB_VITALS,
  WEB_VITAL_ORDER,
  histogramP75,
  webVitalBucket,
  webVitalRating,
  type WebVitalMetric,
  type WebVitalRating,
} from '@mernpress/contracts';
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

export interface RecordVitalInput {
  metric: WebVitalMetric;
  /** Raw value: milliseconds, or the CLS score (scaled to milli-score here). */
  value: number;
  userAgent?: string | null | undefined;
  now?: Date | undefined;
}

export interface VitalsSummaryEntry {
  metric: WebVitalMetric;
  label: string;
  /** p75 in stored units (ms, or CLS ×1000). */
  p75: number | null;
  rating: WebVitalRating | null;
  samples: number;
}

export interface AnalyticsPruneResult {
  pruned: number;
  /** Web-vitals rows removed by the same sweep. */
  vitalsPruned: number;
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
  /** One entry per metric, in display order; `p75` is null with no samples. */
  vitals: VitalsSummaryEntry[];
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

  /**
   * Record one field Core Web Vitals sample into its daily histogram. The
   * beacon never sends a path or identifier, so the row is (day, metric, bucket).
   */
  async function recordVital(input: RecordVitalInput): Promise<boolean> {
    if (input.userAgent && BOT_AGENT.test(input.userAgent)) return false;
    const definition = WEB_VITALS[input.metric];
    if (!definition) return false;
    if (!Number.isFinite(input.value) || input.value < 0) return false;
    // CLS arrives as the unitless score; bucket math uses milli-score.
    const stored =
      definition.unit === 'score' ? Math.round(input.value * 1000) : Math.round(input.value);
    if (stored > definition.max) return false;
    const bucket = webVitalBucket(input.metric, stored);
    const day = utcDay(input.now ?? now());
    await prisma.webVitalDaily.upsert({
      where: { day_metric_bucket: { day, metric: input.metric, bucket } },
      create: { day, metric: input.metric, bucket, count: 1 },
      update: { count: { increment: 1 } },
    });
    return true;
  }

  /**
   * Public-safe field vitals for the speculation gate: aggregated p75/rating/
   * samples over the last 28 days, with no paths, hosts or identifiers.
   */
  async function vitalsSummary(): Promise<{ days: number; vitals: VitalsSummaryEntry[] }> {
    const days = 28;
    const today = utcDay(now());
    const start = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const vitalRows = await prisma.webVitalDaily.findMany({
      where: { day: { gte: start } },
      select: { metric: true, bucket: true, count: true },
    });
    const byMetric = new Map<WebVitalMetric, Array<{ bucket: number; count: number }>>();
    for (const row of vitalRows) {
      if (!(row.metric in WEB_VITALS)) continue;
      const metric = row.metric as WebVitalMetric;
      const list = byMetric.get(metric) ?? [];
      list.push({ bucket: row.bucket, count: row.count });
      byMetric.set(metric, list);
    }
    return {
      days,
      vitals: WEB_VITAL_ORDER.map((metric) => {
        const counts = byMetric.get(metric) ?? [];
        const samples = counts.reduce((sum, entry) => sum + entry.count, 0);
        const p75 = histogramP75(counts);
        return {
          metric,
          label: WEB_VITALS[metric].label,
          p75,
          rating: p75 === null ? null : webVitalRating(metric, p75),
          samples,
        };
      }),
    };
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
    const vitalRows = await prisma.webVitalDaily.findMany({
      where: { day: { gte: start } },
      select: { metric: true, bucket: true, count: true },
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

    const byMetric = new Map<WebVitalMetric, Array<{ bucket: number; count: number }>>();
    for (const row of vitalRows) {
      if (!(row.metric in WEB_VITALS)) continue;
      const metric = row.metric as WebVitalMetric;
      const list = byMetric.get(metric) ?? [];
      list.push({ bucket: row.bucket, count: row.count });
      byMetric.set(metric, list);
    }
    const vitals: VitalsSummaryEntry[] = WEB_VITAL_ORDER.map((metric) => {
      const counts = byMetric.get(metric) ?? [];
      const samples = counts.reduce((sum, entry) => sum + entry.count, 0);
      const p75 = histogramP75(counts);
      return {
        metric,
        label: WEB_VITALS[metric].label,
        p75,
        rating: p75 === null ? null : webVitalRating(metric, p75),
        samples,
      };
    });

    return {
      days: windowDays,
      totalViews,
      uniquePaths: paths.size,
      daily: [...daily.entries()].map(([day, views]) => ({ day, views })),
      topPaths: rank(paths).map(([path, views]) => ({ path, views })),
      topReferrers: rank(referrers).map(([host, views]) => ({ host, views })),
      vitals,
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
      return { pruned: 0, vitalsPruned: 0, retentionDays: 0, cutoffDay: null };
    }
    // Keep the invariant in one place even for programmatic callers.
    const days = Math.min(3650, Math.trunc(retentionDays));
    if (days <= 0) {
      return { pruned: 0, vitalsPruned: 0, retentionDays: days, cutoffDay: null };
    }
    const today = utcDay(now());
    const cutoff = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const [result, vitals] = await prisma.$transaction([
      prisma.analyticsDaily.deleteMany({ where: { day: { lt: cutoff } } }),
      prisma.webVitalDaily.deleteMany({ where: { day: { lt: cutoff } } }),
    ]);
    return {
      pruned: result.count,
      vitalsPruned: vitals.count,
      retentionDays: days,
      cutoffDay: cutoff.toISOString().slice(0, 10),
    };
  }

  return { record, recordVital, vitalsSummary, summary, prune };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
