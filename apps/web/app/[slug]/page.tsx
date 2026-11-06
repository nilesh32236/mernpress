import { notFound } from 'next/navigation';
import {
  getPublishedBySlug,
  getSiteSettings,
  listPublishedPosts,
  mediaUrl,
  siteUrl,
} from '@/lib/api';
import { hreflangAlternates } from '@mernpress/contracts';
import PostView from '@/components/PostView';
import { LanguageLinks } from '@/components/LanguageLinks';
import { requestThemeStrings } from '@/lib/theme-strings';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';
import JsonLd from '@/components/JsonLd';
import { articleSchema, breadcrumbSchema, collectionSchema } from '@/lib/seo';
import type { Metadata } from 'next';
import type { PublicPost } from '@/lib/api';

export const dynamicParams = true;

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackDescription(post: PublicPost): string {
  if (post.seoDescription) return post.seoDescription;
  if (post.excerpt) return post.excerpt;
  const fromToc = post.toc.map((t) => t.text).join(' ');
  if (fromToc) return fromToc.slice(0, 160);
  const fromContent = stripTags(post.renderedContent);
  if (fromContent) return fromContent.slice(0, 160);
  return '';
}

export default async function PageBySlug({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  let post = null;
  let error = false;
  try {
    post = await getPublishedBySlug('page', slug, lang);
  } catch {
    error = true;
  }
  if (error) {
    return (
      <main id="main-content" className="site-main">
        <div className="site-content">
          <p role="status" className="status">
            We couldn\u2019t load content right now. Content is temporarily unavailable. Please try
            again later.
          </p>
        </div>
      </main>
    );
  }
  if (!post) notFound();

  const strings = await requestThemeStrings();
  // Appearance → Customize can assign this page as the posts index.
  const settings = await getSiteSettings().catch(() => null);
  if (settings?.pageForPostsSlug === slug) {
    const sp = await searchParams;
    const pageNumber = Math.max(1, Number(sp?.page ?? 1) || 1);
    const data = await listPublishedPosts(pageNumber, 10).catch(() => null);
    const items = data?.items ?? [];
    const totalPages = data?.pagination.totalPages ?? 1;
    const archiveUrl = `${siteUrl()}/${slug}`;
    return (
      <main id="main-content" className="site-main">
        <JsonLd
          data={collectionSchema(siteUrl(), {
            url: archiveUrl,
            name: post.title,
            posts: items,
          })}
        />
        <div className="site-content">
          <h1 className="blog-title">{post.title}</h1>
          {items.length > 0 ? (
            <PostList posts={items} strings={strings} />
          ) : (
            <p role="status" className="status">
              {strings.noResults}
            </p>
          )}
        </div>
        <Pagination
          page={pageNumber}
          totalPages={totalPages}
          basePath={`/${slug}`}
          strings={strings}
        />
      </main>
    );
  }

  const canonical = post.canonicalUrl ?? `${siteUrl()}${post.path}`;
  return (
    <>
      <JsonLd data={articleSchema(siteUrl(), post)} />
      <JsonLd
        data={breadcrumbSchema(siteUrl(), [
          { name: 'Home', url: siteUrl() },
          { name: post.title, url: canonical },
        ])}
      />
      <LanguageLinks
        language={post.language}
        translations={post.translations ?? []}
        label={strings.languagesLabel}
      />
      <PostView post={post} strings={strings} />
    </>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { lang } = await searchParams;
  const [post, settings] = await Promise.all([
    getPublishedBySlug('page', slug, lang).catch(() => null),
    getSiteSettings().catch(() => null),
  ]);
  if (!post) return { title: 'Not found' };

  const title = post.seoTitle ?? post.title;
  const description = fallbackDescription(post);
  const languages =
    settings?.languages && post.translations
      ? hreflangAlternates(
          settings.languages,
          post.translations,
          { language: post.language, path: post.path },
          (path) => `${siteUrl()}${path}`,
        )
      : undefined;
  return {
    title,
    description: description || undefined,
    robots: post.robots ?? undefined,
    alternates: {
      canonical: post.canonicalUrl ?? `${siteUrl()}${post.path ?? `/${post.slug}`}`,
      ...(languages ? { languages } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.ogTitle ?? title,
      description: post.ogDescription ?? (description || undefined),
      ...(post.featuredImage ? { images: [mediaUrl(post.featuredImage.url)] } : {}),
    },
    openGraph: {
      title: post.ogTitle ?? title,
      description: post.ogDescription ?? (description || undefined),
      ...(post.featuredImage
        ? {
            images: [
              {
                url: mediaUrl(post.featuredImage.url),
                ...(post.featuredImage.width ? { width: post.featuredImage.width } : {}),
                ...(post.featuredImage.height ? { height: post.featuredImage.height } : {}),
                alt: post.featuredImage.altText,
              },
            ],
          }
        : {}),
    },
  };
}
