import { mediaUrl, type PublicPost } from './api';

/**
 * JSON-LD builders for the public site.
 *
 * Everything is derived from data that is already visible on the page: no
 * invented ratings, prices or FAQs. The layout emits one `@graph` (WebSite +
 * Organization); pages reference those entities by `@id`, which keeps the
 * markup consistent instead of duplicating an Organization block per page.
 */
export type JsonLd = Record<string, unknown>;

export function entityId(base: string, fragment: string): string {
  return `${base}/#${fragment}`;
}

export function websiteSchema(
  base: string,
  site: { title: string; tagline: string | null },
): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': entityId(base, 'website'),
    url: base,
    name: site.title,
    description: site.tagline ?? undefined,
    inLanguage: 'en',
    publisher: { '@id': entityId(base, 'organization') },
  };
}

export function organizationSchema(base: string, site: { title: string }): JsonLd {
  return {
    '@type': 'Organization',
    '@id': entityId(base, 'organization'),
    name: site.title,
    url: base,
    logo: `${base}/icon.svg`,
  };
}

export function siteGraph(base: string, site: { title: string; tagline: string | null }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationSchema(base, site), websiteSchema(base, site)],
  };
}

export interface Crumb {
  name: string;
  url: string;
}

export function breadcrumbSchema(base: string, crumbs: Crumb[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${crumbs.at(-1)?.url ?? base}#breadcrumb`,
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

function postUrl(base: string, post: PublicPost, permalinkBase: string): string {
  return post.type === 'page' ? `${base}/${post.slug}` : `${base}/${permalinkBase}/${post.slug}`;
}

export function articleSchema(base: string, post: PublicPost, permalinkBase: string): JsonLd {
  const url = post.canonicalUrl ?? postUrl(base, post, permalinkBase);
  const description = post.seoDescription ?? post.excerpt ?? undefined;
  const images = post.featuredImage
    ? [
        {
          '@type': 'ImageObject',
          url: mediaUrl(post.featuredImage.url),
          ...(post.featuredImage.width ? { width: post.featuredImage.width } : {}),
          ...(post.featuredImage.height ? { height: post.featuredImage.height } : {}),
          ...(post.featuredImage.altText ? { caption: post.featuredImage.altText } : {}),
        },
      ]
    : undefined;

  // Pages are WebPage; posts are BlogPosting. Both reference the site graph.
  const type = post.type === 'page' ? 'WebPage' : 'BlogPosting';
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#article`,
    headline: post.seoTitle ?? post.title,
    name: post.seoTitle ?? post.title,
    description,
    url,
    mainEntityOfPage: { '@id': url },
    inLanguage: 'en',
    isPartOf: { '@id': entityId(base, 'website') },
    ...(post.author
      ? {
          author: {
            '@type': 'Person',
            name: post.author.username,
            url: `${base}/author/${encodeURIComponent(post.author.username)}`,
          },
        }
      : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    ...(images ? { image: images } : {}),
    ...(post.terms.tags.length > 0
      ? { keywords: post.terms.tags.map((tag) => tag.name).join(', ') }
      : {}),
    ...(post.terms.categories.length > 0
      ? { articleSection: post.terms.categories.map((term) => term.name).join(', ') }
      : {}),
  };
}

export function collectionSchema(
  base: string,
  options: {
    url: string;
    name: string;
    description?: string | null;
    posts: PublicPost[];
    permalinkBase: string;
  },
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${options.url}#collection`,
    url: options.url,
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    isPartOf: { '@id': entityId(base, 'website') },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: options.posts.slice(0, 20).map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: postUrl(base, post, options.permalinkBase),
        name: post.title,
      })),
    },
  };
}

export function profileSchema(base: string, username: string): JsonLd {
  const url = `${base}/author/${encodeURIComponent(username)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${url}#profile`,
    url,
    name: `Author: ${username}`,
    isPartOf: { '@id': entityId(base, 'website') },
    mainEntity: {
      '@type': 'Person',
      name: username,
      url,
    },
  };
}
