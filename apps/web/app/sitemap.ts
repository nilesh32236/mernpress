import type { MetadataRoute } from 'next';
import { getSiteSettings, listPublished, siteUrl, type PublicPost } from '@/lib/api';
import { buildPostSitemapEntries } from '@/lib/sitemap';

// A cached sitemap hid newly published translations (and even new posts) for up
// to an hour. The route is cheap at this scale; render it per request so search
// engines see new language variants immediately.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSiteSettings().catch(() => null);
  if (settings?.blogPublic === false) {
    return [];
  }

  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date() },
    { url: `${base}/posts`, lastModified: new Date() },
  ];

  const languages = settings?.languages?.enabled ?? ['en'];
  const documents: PublicPost[] = [];
  for (const type of ['post', 'page'] as const) {
    for (const language of languages) {
      let page = 1;
      let totalPages = 1;
      try {
        // Page through the public list instead of silently dropping everything
        // after the first 100 documents; 50 pages is a safety cap.
        while (page <= totalPages && page <= 50) {
          const data = await listPublished(type, page, 100, language, true);
          documents.push(...(data?.items ?? []));
          totalPages = data?.pagination.totalPages ?? 1;
          page += 1;
        }
      } catch {
        // Ignore API failures during sitemap generation.
      }
    }
  }

  // Group variants so each translated document carries xhtml:link alternates
  // (including x-default) alongside its URL.
  entries.push(...buildPostSitemapEntries(base, settings?.languages?.default ?? 'en', documents));

  return entries;
}
