import { notFound } from 'next/navigation';
import { getPublishedBySlug, listPublishedPosts, mediaUrl, siteUrl } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostView from '@/components/PostView';
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

  return <PostView post={post} morePosts={morePosts} />;
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
      canonical: post.canonicalUrl ?? `${siteUrl()}/posts/${post.slug}`,
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
