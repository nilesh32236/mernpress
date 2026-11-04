import { getSiteSettings, listPublishedPosts, siteUrl } from '@/lib/api';

export const revalidate = 60;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** WordPress-compatible RSS 2.0 feed for the latest published posts. */
export async function GET(): Promise<Response> {
  const base = siteUrl();
  const settings = await getSiteSettings().catch(() => null);
  const data = await listPublishedPosts(1, settings?.postsPerRss ?? 20).catch(() => null);
  const items = data?.items ?? [];
  const siteTitle = settings?.siteTitle ?? 'MERNPress';
  const description = settings?.tagline || 'MERNPress public site.';
  const useExcerpt = settings?.rssUseExcerpt === true;

  const entries = items
    .map((post) => {
      const link = `${base}/posts/${post.slug}`;
      const pubDate = post.publishedAt ? new Date(post.publishedAt).toUTCString() : '';
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(
        useExcerpt ? (post.excerpt ?? '') : post.renderedContent,
      )}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${escapeXml(base)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-US</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${entries}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
}
