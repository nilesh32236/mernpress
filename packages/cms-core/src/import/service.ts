import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

/**
 * WordPress WXR importer (Tools → Import → WordPress).
 *
 * Imports posts and pages, their categories/tags and publish dates from a
 * WordPress eXtended RSS export. Attachments, comments, users and custom fields
 * are skipped (and reported), matching the documented limitation.
 */
export interface ImportResult {
  imported: number;
  posts: number;
  pages: number;
  skipped: number;
  failed: number;
  terms: number;
  errors: Array<{ title: string; message: string }>;
}

export interface ImportServiceOptions {
  prisma: DatabaseClient;
  now?: () => Date;
}

const MAX_ITEMS = 1000;
const MAX_XML_LENGTH = 10 * 1024 * 1024;

interface ParsedItem {
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  type: 'post' | 'page';
  status: string;
  publishedAt: Date | null;
  categories: Array<{ name: string; slug: string }>;
  tags: Array<{ name: string; slug: string }>;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tag(block: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, 'i'));
  return match ? decodeEntities(match[1]!.trim()) : null;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || 'imported'
  );
}

export function parseWxr(xml: string): { items: ParsedItem[]; skipped: number } {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const items: ParsedItem[] = [];
  let skipped = 0;
  for (const block of blocks.slice(0, MAX_ITEMS)) {
    const rawType = tag(block, 'wp:post_type') ?? 'post';
    const status = (tag(block, 'wp:status') ?? 'publish').toLowerCase();
    if (rawType !== 'post' && rawType !== 'page') {
      skipped += 1;
      continue;
    }
    if (['trash', 'auto-draft', 'inherit', 'revision'].includes(status)) {
      skipped += 1;
      continue;
    }
    const title = tag(block, 'title')?.trim() || 'Untitled';
    const slugSource = tag(block, 'wp:post_name')?.trim() || title;
    const content = tag(block, 'content:encoded') ?? '';
    const excerpt = tag(block, 'excerpt:encoded');
    const dateRaw =
      tag(block, 'wp:post_date_gmt') && tag(block, 'wp:post_date_gmt') !== '0000-00-00 00:00:00'
        ? tag(block, 'wp:post_date_gmt')
        : tag(block, 'wp:post_date');
    let publishedAt: Date | null = null;
    if (dateRaw) {
      const parsed = new Date(`${dateRaw.replace(' ', 'T')}Z`);
      if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
    }
    const categories: ParsedItem['categories'] = [];
    const tags: ParsedItem['tags'] = [];
    for (const match of block.matchAll(/<category\s+([^>]*)>([\s\S]*?)<\/category>/gi)) {
      const attrs = match[1] ?? '';
      const domain = /domain="([^"]+)"/i.exec(attrs)?.[1];
      const nicename = /nicename="([^"]+)"/i.exec(attrs)?.[1];
      const name = decodeEntities(match[2]!.trim());
      if (!name) continue;
      const entry = { name, slug: (nicename ?? slugify(name)).trim() };
      if (domain === 'category') categories.push(entry);
      else if (domain === 'post_tag') tags.push(entry);
    }
    items.push({
      title,
      slug: slugify(slugSource),
      content,
      excerpt: excerpt ? excerpt.trim() || null : null,
      type: rawType,
      status,
      publishedAt,
      categories,
      tags,
    });
  }
  return { items, skipped: skipped + Math.max(0, blocks.length - MAX_ITEMS) };
}

export function createImportService({ prisma, now = () => new Date() }: ImportServiceOptions) {
  async function uniqueSlug(type: 'post' | 'page', base: string): Promise<string> {
    let candidate = base;
    let counter = 1;
    for (;;) {
      const existing = await prisma.post.findFirst({
        where: { type, slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      counter += 1;
      candidate = `${base}-${counter}`.slice(0, 200);
    }
  }

  async function ensureTerm(taxonomy: 'category' | 'tag', name: string, slug: string) {
    const existing = await prisma.term.findFirst({ where: { taxonomy, slug } });
    if (existing) return existing.id;
    const created = await prisma.term.create({
      data: { taxonomy, name: name.slice(0, 200), slug: slug.slice(0, 200) },
    });
    return created.id;
  }

  async function importWordPress(
    principal: Principal,
    xml: string,
    options: { type?: 'post' | 'page' } = {},
  ): Promise<ImportResult> {
    requireCapability(principal, 'content.create');
    if (!xml || xml.length > MAX_XML_LENGTH) {
      throw new ContentError('VALIDATION_ERROR', 'The import file is empty or too large.', 400);
    }
    if (!/<rss[\s>]/i.test(xml)) {
      throw new ContentError('VALIDATION_ERROR', 'That file is not a WordPress export (WXR).', 400);
    }
    const parsed = parseWxr(xml);
    const result: ImportResult = {
      imported: 0,
      posts: 0,
      pages: 0,
      skipped: parsed.skipped,
      failed: 0,
      terms: 0,
      errors: [],
    };
    const typeFilter = options.type;
    for (const item of parsed.items) {
      if (typeFilter && item.type !== typeFilter) {
        result.skipped += 1;
        continue;
      }
      try {
        const slug = await uniqueSlug(item.type, item.slug);
        const published = item.status === 'publish';
        const publishedAt = published ? (item.publishedAt ?? now()) : item.publishedAt;
        const post = await prisma.post.create({
          data: {
            type: item.type,
            status: published ? 'PUBLISHED' : 'DRAFT',
            title: item.title.slice(0, 500),
            slug,
            excerpt: item.excerpt,
            content: item.content,
            contentFormat: 'wp_block_html',
            authorId: principal.userId,
            publishedAt,
          },
        });
        for (const term of item.categories) {
          const termId = await ensureTerm('category', term.name, term.slug);
          await prisma.postTerm.create({
            data: { postId: post.id, termId, position: 0 },
          });
          result.terms += 1;
        }
        for (const term of item.tags) {
          const termId = await ensureTerm('tag', term.name, term.slug);
          await prisma.postTerm.create({
            data: { postId: post.id, termId, position: 0 },
          });
          result.terms += 1;
        }
        result.imported += 1;
        if (item.type === 'post') result.posts += 1;
        else result.pages += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          title: item.title.slice(0, 120),
          message: error instanceof Error ? error.message.slice(0, 200) : 'Import failed',
        });
      }
    }
    return result;
  }

  return { importWordPress };
}

export type ImportService = ReturnType<typeof createImportService>;
