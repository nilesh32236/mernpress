import { notFound } from 'next/navigation';
import { getPublishedBySlug } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostView from '@/components/PostView';
import type { Metadata } from 'next';

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let post = null;
  let error = false;
  try {
    post = await getPublishedBySlug('post', slug);
  } catch {
    error = true;
  }
  if (error) {
    return (
      <main id="main-content" className="container py-12">
        <p role="status" className="text-slate-600 dark:text-slate-300">
          We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.
        </p>
      </main>
    );
  }
  if (!post) notFound();
  return <PostView post={post} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let post = null;
  try {
    post = await getPublishedBySlug('post', slug);
  } catch {
    post = null;
  }
  if (!post) return { title: 'Not found' };

  const title = post.seoTitle ?? post.title;
  const description = fallbackDescription(post);
  return {
    title,
    description: description || undefined,
    robots: post.robots ?? undefined,
    alternates: post.canonicalUrl ? { canonical: post.canonicalUrl } : undefined,
    openGraph: {
      title: post.ogTitle ?? title,
      description: post.ogDescription ?? (description || undefined),
    },
  };
}
