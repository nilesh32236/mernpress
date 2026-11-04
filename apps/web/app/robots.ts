import type { MetadataRoute } from 'next';
import { getSiteSettings, siteUrl } from '@/lib/api';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteUrl();
  const settings = await getSiteSettings().catch(() => null);
  if (settings?.blogPublic === false) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${base}/sitemap.xml`,
  };
}
