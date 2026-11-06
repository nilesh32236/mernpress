import type { MetadataRoute } from 'next';
import { mediaUrl, postHref, type PublicPost } from './api';

/**
 * Sitemap entries for published documents, grouped by translation group so
 * every variant advertises the others as `xhtml:link` alternates (the same
 * set the page head emits as hreflang). A single-language document gets no
 * alternates block.
 *
 * `base` is the site origin without a trailing slash; each post's `path`
 * already carries the language prefix from the API.
 */
export function buildPostSitemapEntries(
  base: string,
  defaultLanguage: string,
  posts: PublicPost[],
): MetadataRoute.Sitemap {
  const groups = new Map<string, PublicPost[]>();
  const seen = new Set<string>();

  for (const post of posts) {
    const key = `${post.translationGroup}:${post.language}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const variants = groups.get(post.translationGroup) ?? [];
    variants.push(post);
    groups.set(post.translationGroup, variants);
  }

  const entries: MetadataRoute.Sitemap = [];
  for (const variants of groups.values()) {
    variants.sort((a, b) => a.language.localeCompare(b.language));
    const languages: Record<string, string> = {};
    for (const variant of variants) {
      languages[variant.language] = `${base}${postHref(variant)}`;
    }
    // x-default points at the default-language variant; when that variant is
    // unpublished the home page is a valid language selector.
    const defaultUrl = languages[defaultLanguage] ?? base;
    const alternates =
      variants.length > 1 ? { languages: { ...languages, 'x-default': defaultUrl } } : undefined;

    for (const variant of variants) {
      entries.push({
        url: `${base}${postHref(variant)}`,
        lastModified: new Date(variant.updatedAt),
        changeFrequency: 'weekly',
        ...(variant.featuredImage ? { images: [mediaUrl(variant.featuredImage.url)] } : {}),
        ...(alternates ? { alternates } : {}),
      });
    }
  }
  return entries;
}
