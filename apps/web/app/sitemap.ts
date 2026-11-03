import type { MetadataRoute } from 'next';
import { listPublished, siteUrl } from '@/lib/api';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date() },
    { url: `${base}/posts`, lastModified: new Date() },
  ];

  for (const type of ['post', 'page'] as const) {
    try {
      const data = await listPublished(type, 1, 100);
      for (const post of data?.items ?? []) {
        const url = type === 'post' ? `${base}/posts/${post.slug}` : `${base}/${post.slug}`;
        entries.push({
          url,
          lastModified: new Date(post.updatedAt),
          changeFrequency: 'weekly',
        });
      }
    } catch {
      // Ignore API failures during sitemap generation.
    }
  }

  return entries;
}
