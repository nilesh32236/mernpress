import { getPermalinkBase, getSiteSettings, listPublished, siteUrl } from '@/lib/api';

export const revalidate = 600;

/**
 * llms.txt — a curated, machine-readable map of the site for AI assistants.
 *
 * This is an experimental convention (not a W3C standard, and Google says it is
 * not required), so it only lists canonical public URLs that are already
 * crawlable. It is never treated as an access-control file.
 */
export async function GET(): Promise<Response> {
  const base = siteUrl();
  const settings = await getSiteSettings().catch(() => null);
  const title = settings?.siteTitle ?? 'MERNPress';
  const tagline = settings?.tagline?.trim();
  const postBase = settings?.permalinkBase ?? (await getPermalinkBase().catch(() => 'posts'));

  if (settings?.blogPublic === false) {
    return new Response(`# ${title}\n\nThis site is not public.\n`, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const [posts, pages] = await Promise.all([
    listPublished('post', 1, 100).catch(() => null),
    listPublished('page', 1, 100).catch(() => null),
  ]);

  const link = (label: string, url: string, summary?: string | null): string =>
    `- [${label}](${url})${summary ? `: ${summary.replace(/\s+/g, ' ').trim()}` : ''}`;

  const lines: string[] = [`# ${title}`];
  if (tagline) lines.push('', `> ${tagline}`);
  lines.push('', '## Posts');
  for (const post of posts?.items ?? []) {
    lines.push(
      link(post.title, `${base}/${postBase}/${post.slug}`, post.excerpt ?? post.seoDescription),
    );
  }
  if ((posts?.items.length ?? 0) === 0) lines.push('- No published posts.');

  lines.push('', '## Pages');
  for (const page of pages?.items ?? []) {
    lines.push(`${link(page.title, `${base}/${page.slug}`, page.excerpt ?? page.seoDescription)}`);
  }
  if ((pages?.items.length ?? 0) === 0) lines.push('- No published pages.');

  lines.push(
    '',
    '## Optional',
    `- [RSS feed](${base}/feed): latest posts in RSS 2.0`,
    `- [Sitemap](${base}/sitemap.xml): canonical URLs with last-modified dates`,
    '',
    'This file lists canonical, publicly indexable URLs only. It is not a',
    'permissions file and grants no access to unpublished content.',
    '',
  );

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
}
