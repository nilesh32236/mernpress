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
      try {
        const data = await listPublished(type, 1, 100, language);
        documents.push(...(data?.items ?? []));
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
