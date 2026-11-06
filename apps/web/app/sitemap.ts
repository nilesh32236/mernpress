import type { MetadataRoute } from 'next';
import { getSiteSettings, listPublished, mediaUrl, postHref, siteUrl } from '@/lib/api';

export const revalidate = 3600;

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
  for (const type of ['post', 'page'] as const) {
    for (const language of languages) {
      try {
        const data = await listPublished(type, 1, 100, language);
        for (const post of data?.items ?? []) {
          const url = `${base}${postHref(post)}`;
          entries.push({
            url,
            lastModified: new Date(post.updatedAt),
            changeFrequency: 'weekly',
            // Image sitemap entries help image search discover featured media.
            ...(post.featuredImage ? { images: [mediaUrl(post.featuredImage.url)] } : {}),
          });
        }
      } catch {
        // Ignore API failures during sitemap generation.
      }
    }
  }

  return entries;
}
