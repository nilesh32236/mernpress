import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getPermalinkBase,
  getPublishedBySlug,
  listPublishedPosts,
  mediaUrl,
  postPath,
  siteUrl,
} from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostView from '@/components/PostView';

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
  return fromContent.slice(0, 160);
}

export default async function CustomPostPage({
  params,
}: {
  params: Promise<{ slug: string; postSlug: string }>;
}) {
  const { slug: section, postSlug: slug } = await params;
  const base = await getPermalinkBase();
  if (section !== base) notFound();

  let error = false;
  const post = await getPublishedBySlug('post', slug).catch(() => {
    error = true;
    return null;
  });
  if (error) {
    return (
      <main id="main-content" className="site-main">
        <div className="site-content">
          <p role="status" className="status">
            We couldn’t load content right now. Content is temporarily unavailable. Please try again
            later.
          </p>
        </div>
      </main>
    );
  }
  if (!post) notFound();

  const recent = await listPublishedPosts(1, 10).catch(() => null);
  const morePosts = recent?.items ?? [];
  return <PostView post={post} morePosts={morePosts} base={base} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; postSlug: string }>;
}): Promise<Metadata> {
  const { slug: section, postSlug: slug } = await params;
  const base = await getPermalinkBase();
  if (section !== base) return { title: 'Not found' };
  const post = await getPublishedBySlug('post', slug).catch(() => null);
  if (!post) return { title: 'Not found' };
  const title = post.seoTitle ?? post.title;
  const description = fallbackDescription(post);
  return {
    title,
    description: description || undefined,
    robots: post.robots ?? undefined,
    alternates: {
      canonical: post.canonicalUrl ?? `${siteUrl()}${postPath(post.slug, base)}`,
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
