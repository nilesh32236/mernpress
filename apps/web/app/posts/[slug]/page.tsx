import { notFound } from 'next/navigation';
import {
  getPermalinkBase,
  getPublishedBySlug,
  listPublicPosts,
  listPublishedPosts,
  mediaUrl,
  postPath,
  siteUrl,
} from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostView from '@/components/PostView';
import JsonLd from '@/components/JsonLd';
import { articleSchema, breadcrumbSchema } from '@/lib/seo';
import type { Metadata } from 'next';

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

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let error = false;
  // The canonical post URL is driven by the Permalinks setting. When the base
  // is not "posts", /posts/<slug> is not a valid permalink (the catch-all
  // /[base]/[slug] route serves the post instead).
  if ((await getPermalinkBase()) !== 'posts') notFound();
  const post = await getPublishedBySlug('post', slug).catch(() => {
    error = true;
    return null;
  });
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

  // WordPress's single-post template ends with the previous post and a
  // "More posts" list. Fetch the newest posts once; failures degrade to the
  // post itself rather than breaking the page.
  const recent = await listPublishedPosts(1, 10).catch(() => null);
  const morePosts = recent?.items ?? [];
  const base = await getPermalinkBase();

  // Related posts come from the primary category. The current post is always
  // excluded; when no category matches exist the component falls back to the
  // newest posts as "More posts" (still excluding the current post).
  const primaryCategory = post.terms.categories[0]?.slug;
  const relatedData = primaryCategory
    ? await listPublicPosts({ category: primaryCategory, page: 1, perPage: 6 }).catch(() => null)
    : null;
  // Only same-category results are "Related posts"; when there are none the
  // component falls back to the newest posts and labels them "More posts".
  const relatedPosts = primaryCategory
    ? (relatedData?.items ?? []).filter((entry) => entry.id !== post.id).slice(0, 3)
    : [];
  const canonical = post.canonicalUrl ?? `${siteUrl()}${postPath(post.slug, base)}`;
  return (
    <>
      <JsonLd data={articleSchema(siteUrl(), post, base)} />
      <JsonLd
        data={breadcrumbSchema(siteUrl(), [
          { name: 'Home', url: siteUrl() },
          { name: 'Blog', url: `${siteUrl()}/posts` },
          { name: post.title, url: canonical },
        ])}
      />
      <PostView post={post} morePosts={morePosts} relatedPosts={relatedPosts} base={base} />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBySlug('post', slug).catch(() => null);
  if (!post) return { title: 'Not found' };

  const title = post.seoTitle ?? post.title;
  const description = fallbackDescription(post);
  return {
    title,
    description: description || undefined,
    robots: post.robots ?? undefined,
    alternates: {
      canonical:
        post.canonicalUrl ?? `${siteUrl()}${postPath(post.slug, await getPermalinkBase())}`,
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
