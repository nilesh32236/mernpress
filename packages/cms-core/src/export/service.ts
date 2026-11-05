import type { DatabaseClient, Prisma } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

/**
 * WordPress eXtended RSS (WXR) export.
 *
 * Produces the same XML format WordPress's Tools → Export downloads, so the
 * file can be imported by WordPress or by MERNPress's own importer. Posts,
 * pages, categories/tags, comments and media attachments are included according
 * to the selected scope.
 */
export type ExportScope = 'all' | 'posts' | 'pages' | 'media';

/**
 * WordPress export filters. WordPress exposes a separate fieldset per content
 * type; MERNPress applies one filter set to whichever post types the scope
 * includes. `category` only applies to posts (a term id).
 */
export type ExportStatus = 'publish' | 'draft' | 'private' | 'future';

export interface ExportFilters {
  /** Author user id. */
  author?: string | undefined;
  /** Inclusive UTC start date, `YYYY-MM-DD`. */
  startDate?: string | undefined;
  /** Inclusive UTC end date, `YYYY-MM-DD`. */
  endDate?: string | undefined;
  status?: ExportStatus | undefined;
  /** Category term id; posts only. */
  category?: string | undefined;
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ContentError('VALIDATION_ERROR', `${field} must be a YYYY-MM-DD date`, 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ContentError('VALIDATION_ERROR', `${field} is not a real date`, 400);
  }
  return date;
}

function postWhere(types: string[], filters: ExportFilters, now: Date): Prisma.PostWhereInput {
  const includePosts = types.includes('post');
  if (filters.category !== undefined && !includePosts) {
    throw new ContentError('VALIDATION_ERROR', 'The category filter only applies to posts', 400);
  }

  const where: Prisma.PostWhereInput = { type: { in: types } };
  if (filters.author) where.authorId = filters.author;
  if (filters.category) {
    where.terms = { some: { termId: filters.category, term: { taxonomy: 'category' } } };
  }

  const start = filters.startDate ? parseDate(filters.startDate, 'startDate') : null;
  const endExclusive = filters.endDate
    ? new Date(parseDate(filters.endDate, 'endDate').getTime() + 24 * 60 * 60 * 1000)
    : null;
  if (start && endExclusive && start.getTime() >= endExclusive.getTime()) {
    throw new ContentError(
      'VALIDATION_ERROR',
      'The start date must be on or before the end date',
      400,
    );
  }
  if (start || endExclusive) {
    const range: Prisma.DateTimeFilter = {};
    if (start) range.gte = start;
    if (endExclusive) range.lt = endExclusive;
    // WordPress filters on post_date: the publish date once published, the
    // creation date for drafts.
    where.OR = [{ publishedAt: range }, { publishedAt: null, createdAt: range }];
  }

  switch (filters.status) {
    case 'publish':
      where.status = 'PUBLISHED';
      where.isPrivate = false;
      break;
    case 'draft':
      where.status = 'DRAFT';
      where.isPrivate = false;
      where.scheduledAt = null;
      break;
    case 'private':
      where.isPrivate = true;
      break;
    case 'future':
      where.status = 'DRAFT';
      where.isPrivate = false;
      where.scheduledAt = { gt: now };
      break;
    case undefined:
      where.status = { not: 'TRASHED' };
      break;
  }
  return where;
}

export interface ExportServiceOptions {
  prisma: DatabaseClient;
  now?: () => Date;
}

const WXR_VERSION = '1.2';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** WordPress writes `YYYY-MM-DD HH:MM:SS` in the export. */
function wpDate(value: Date): string {
  return value.toISOString().replace('T', ' ').slice(0, 19);
}

function postStatus(status: string): string {
  if (status === 'PUBLISHED') return 'publish';
  if (status === 'TRASHED') return 'trash';
  return 'draft';
}

function commentApproved(status: string): string {
  if (status === 'APPROVED') return '1';
  if (status === 'SPAM') return 'spam';
  if (status === 'TRASHED') return 'trash';
  return '0';
}

function slugFromName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || 'attachment'
  );
}

export function createExportService({ prisma, now = () => new Date() }: ExportServiceOptions) {
  async function option<T>(key: string, fallback: T): Promise<T> {
    const row = await prisma.option.findUnique({ where: { key } });
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  async function exportWxr(
    principal: Principal,
    scope: ExportScope,
    filters: ExportFilters = {},
  ): Promise<string> {
    // WordPress gates Tools → Export on the export capability; this build
    // grants it to administrators (manage_options).
    requireCapability(principal, 'manage_options');

    const includePosts = scope === 'all' || scope === 'posts';
    const includePages = scope === 'all' || scope === 'pages';
    const includeMedia = scope === 'all' || scope === 'media';

    const [siteTitle, siteDescription, siteUrl, wordpressUrl, language, permalinkBase] =
      await Promise.all([
        option<string>('site_title', 'MERNPress'),
        option<string>('site_tagline', ''),
        option<string>('site_url', ''),
        option<string>('wordpress_url', ''),
        option<string>('site_language', 'en_US'),
        option<string>('permalink_base', 'posts'),
      ]);
    const baseUrl = (siteUrl || wordpressUrl || 'http://localhost').replace(/\/+$/, '');
    const types: string[] = [];
    if (includePosts) types.push('post');
    if (includePages) types.push('page');

    const posts =
      types.length > 0
        ? await prisma.post.findMany({
            where: types.length > 0 ? postWhere(types, filters, now()) : { type: { in: types } },
            orderBy: { createdAt: 'asc' },
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                },
              },
              terms: { include: { term: true } },
              comments: { orderBy: { createdAt: 'asc' } },
            },
          })
        : [];

    const media = includeMedia
      ? await prisma.mediaItem.findMany({
          orderBy: { createdAt: 'asc' },
          include: { uploadedBy: { select: { id: true, username: true, email: true } } },
        })
      : [];

    const authors = new Map<
      string,
      {
        id: string;
        username: string;
        email: string | null;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
      }
    >();
    for (const post of posts) {
      if (post.author) authors.set(post.author.id, post.author);
    }
    for (const item of media) {
      if (item.uploadedBy) {
        if (!authors.has(item.uploadedBy.id)) {
          authors.set(item.uploadedBy.id, {
            id: item.uploadedBy.id,
            username: item.uploadedBy.username,
            email: item.uploadedBy.email,
            displayName: null,
            firstName: null,
            lastName: null,
          });
        }
      }
    }

    let numericId = 1;
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8" ?>');
    lines.push(
      '<rss version="2.0"\n' +
        '\txmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"\n' +
        '\txmlns:content="http://purl.org/rss/1.0/modules/content/"\n' +
        '\txmlns:wfw="http://wellformedweb.org/CommentAPI/"\n' +
        '\txmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
        '\txmlns:wp="http://wordpress.org/export/1.2/">',
    );
    lines.push('<channel>');
    lines.push(`\t<title>${cdata(siteTitle)}</title>`);
    lines.push(`\t<link>${escapeXml(baseUrl)}</link>`);
    lines.push(`\t<description>${cdata(siteDescription)}</description>`);
    lines.push(`\t<pubDate>${new Date().toUTCString()}</pubDate>`);
    lines.push(`\t<language>${escapeXml(language.replace('_', '-'))}</language>`);
    lines.push(`\t<wp:wxr_version>${WXR_VERSION}</wp:wxr_version>`);
    lines.push(`\t<wp:base_site_url>${escapeXml(baseUrl)}</wp:base_site_url>`);
    lines.push(`\t<wp:base_blog_url>${escapeXml(baseUrl)}</wp:base_blog_url>`);
    lines.push('\t<generator>MERNPress</generator>');

    for (const author of authors.values()) {
      lines.push('\t<wp:author>');
      lines.push(`\t\t<wp:author_id>${escapeXml(author.id)}</wp:author_id>`);
      lines.push(`\t\t<wp:author_login>${cdata(author.username)}</wp:author_login>`);
      lines.push(`\t\t<wp:author_email>${cdata(author.email ?? '')}</wp:author_email>`);
      lines.push(
        `\t\t<wp:author_display_name>${cdata(author.displayName ?? author.username)}</wp:author_display_name>`,
      );
      lines.push(
        `\t\t<wp:author_first_name>${cdata(author.firstName ?? '')}</wp:author_first_name>`,
      );
      lines.push(`\t\t<wp:author_last_name>${cdata(author.lastName ?? '')}</wp:author_last_name>`);
      lines.push('\t</wp:author>');
    }

    for (const post of posts) {
      const id = numericId;
      numericId += 1;
      const date = post.publishedAt ?? post.createdAt;
      const link =
        post.type === 'page'
          ? `${baseUrl}/${encodeURIComponent(post.slug)}`
          : `${baseUrl}/${permalinkBase}/${encodeURIComponent(post.slug)}`;
      lines.push('\t<item>');
      lines.push(`\t\t<title>${cdata(post.title)}</title>`);
      lines.push(`\t\t<link>${escapeXml(link)}</link>`);
      lines.push(`\t\t<pubDate>${date.toUTCString()}</pubDate>`);
      lines.push(`\t\t<dc:creator>${cdata(post.author?.username ?? 'admin')}</dc:creator>`);
      lines.push(`\t\t<guid isPermaLink="false">${escapeXml(`${baseUrl}/?p=${id}`)}</guid>`);
      lines.push(`\t\t<description>${cdata(post.excerpt ?? '')}</description>`);
      lines.push(`\t\t<content:encoded>${cdata(post.content)}</content:encoded>`);
      lines.push(`\t\t<excerpt:encoded>${cdata(post.excerpt ?? '')}</excerpt:encoded>`);
      lines.push(`\t\t<wp:post_id>${id}</wp:post_id>`);
      lines.push(`\t\t<wp:post_date>${cdata(wpDate(date))}</wp:post_date>`);
      lines.push(`\t\t<wp:post_date_gmt>${cdata(wpDate(date))}</wp:post_date_gmt>`);
      lines.push('\t\t<wp:comment_status><![CDATA[open]]></wp:comment_status>');
      lines.push('\t\t<wp:ping_status><![CDATA[open]]></wp:ping_status>');
      lines.push(`\t\t<wp:post_name>${cdata(post.slug)}</wp:post_name>`);
      lines.push(`\t\t<wp:status>${cdata(postStatus(post.status))}</wp:status>`);
      lines.push('\t\t<wp:post_parent>0</wp:post_parent>');
      lines.push('\t\t<wp:menu_order>0</wp:menu_order>');
      lines.push(`\t\t<wp:post_type>${cdata(post.type)}</wp:post_type>`);
      lines.push('\t\t<wp:post_password></wp:post_password>');
      lines.push('\t\t<wp:is_sticky>0</wp:is_sticky>');
      for (const link of post.terms) {
        const domain = link.term.taxonomy === 'category' ? 'category' : 'post_tag';
        lines.push(
          `\t\t<category domain="${domain}" nicename="${escapeXml(link.term.slug)}">${cdata(link.term.name)}</category>`,
        );
      }
      for (const comment of post.comments) {
        lines.push('\t\t<wp:comment>');
        lines.push(`\t\t\t<wp:comment_id>${escapeXml(comment.id)}</wp:comment_id>`);
        lines.push(`\t\t\t<wp:comment_author>${cdata(comment.authorName)}</wp:comment_author>`);
        lines.push(
          `\t\t\t<wp:comment_author_email>${cdata(comment.authorEmail)}</wp:comment_author_email>`,
        );
        lines.push(
          `\t\t\t<wp:comment_author_url>${cdata(comment.authorUrl ?? '')}</wp:comment_author_url>`,
        );
        lines.push(`\t\t\t<wp:comment_date>${cdata(wpDate(comment.createdAt))}</wp:comment_date>`);
        lines.push(
          `\t\t\t<wp:comment_date_gmt>${cdata(wpDate(comment.createdAt))}</wp:comment_date_gmt>`,
        );
        lines.push(`\t\t\t<wp:comment_content>${cdata(comment.content)}</wp:comment_content>`);
        lines.push(
          `\t\t\t<wp:comment_approved>${cdata(commentApproved(comment.status))}</wp:comment_approved>`,
        );
        lines.push('\t\t\t<wp:comment_type><![CDATA[]]></wp:comment_type>');
        lines.push('\t\t\t<wp:comment_parent>0</wp:comment_parent>');
        lines.push('\t\t</wp:comment>');
      }
      if (post.featuredMediaId) {
        lines.push('\t\t<wp:postmeta>');
        lines.push('\t\t\t<wp:meta_key><![CDATA[_thumbnail_id]]></wp:meta_key>');
        lines.push(`\t\t\t<wp:meta_value>${cdata(String(post.featuredMediaId))}</wp:meta_value>`);
        lines.push('\t\t</wp:postmeta>');
      }
      lines.push('\t</item>');
    }

    for (const item of media) {
      const id = numericId;
      numericId += 1;
      const url = `${baseUrl}/api/media/${item.id}/${encodeURIComponent(item.fileName)}`;
      lines.push('\t<item>');
      lines.push(`\t\t<title>${cdata(item.originalName)}</title>`);
      lines.push(`\t\t<link>${escapeXml(url)}</link>`);
      lines.push(`\t\t<pubDate>${item.createdAt.toUTCString()}</pubDate>`);
      lines.push(`\t\t<dc:creator>${cdata(item.uploadedBy?.username ?? 'admin')}</dc:creator>`);
      lines.push(`\t\t<guid isPermaLink="false">${escapeXml(url)}</guid>`);
      lines.push(`\t\t<description>${cdata(item.caption)}</description>`);
      lines.push(`\t\t<content:encoded>${cdata(item.description)}</content:encoded>`);
      lines.push(`\t\t<excerpt:encoded>${cdata(item.caption)}</excerpt:encoded>`);
      lines.push(`\t\t<wp:post_id>${id}</wp:post_id>`);
      lines.push(`\t\t<wp:post_date>${cdata(wpDate(item.createdAt))}</wp:post_date>`);
      lines.push(`\t\t<wp:post_date_gmt>${cdata(wpDate(item.createdAt))}</wp:post_date_gmt>`);
      lines.push('\t\t<wp:comment_status><![CDATA[open]]></wp:comment_status>');
      lines.push('\t\t<wp:ping_status><![CDATA[closed]]></wp:ping_status>');
      lines.push(`\t\t<wp:post_name>${cdata(slugFromName(item.originalName))}</wp:post_name>`);
      lines.push('\t\t<wp:status><![CDATA[inherit]]></wp:status>');
      lines.push('\t\t<wp:post_parent>0</wp:post_parent>');
      lines.push('\t\t<wp:menu_order>0</wp:menu_order>');
      lines.push('\t\t<wp:post_type><![CDATA[attachment]]></wp:post_type>');
      lines.push('\t\t<wp:post_password></wp:post_password>');
      lines.push('\t\t<wp:is_sticky>0</wp:is_sticky>');
      lines.push(`\t\t<wp:attachment_url>${cdata(url)}</wp:attachment_url>`);
      lines.push('\t\t<wp:postmeta>');
      lines.push('\t\t\t<wp:meta_key><![CDATA[_wp_attached_file]]></wp:meta_key>');
      lines.push(`\t\t\t<wp:meta_value>${cdata(item.storagePath)}</wp:meta_value>`);
      lines.push('\t\t</wp:postmeta>');
      lines.push('\t</item>');
    }

    lines.push('</channel>');
    lines.push('</rss>');
    return `${lines.join('\n')}\n`;
  }

  return { exportWxr };
}

export type ExportService = ReturnType<typeof createExportService>;
