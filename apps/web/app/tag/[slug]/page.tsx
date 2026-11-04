import { notFound } from 'next/navigation';
import { listPublicPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';

export default async function TagArchive({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let items: PublicPost[];
  try {
    const data = await listPublicPosts({ tag: slug, perPage: 100 });
    items = data?.items ?? [];
  } catch {
    return (
      <main id="main-content" className="site-main">
        <div className="site-content">
          <p role="status" className="status">
            We couldn&rsquo;t load this tag right now. Please try again later.
          </p>
        </div>
      </main>
    );
  }
  if (items.length === 0) notFound();

  const name =
    items.flatMap((post) => post.terms.tags).find((term) => term.slug === slug)?.name ?? slug;

  return (
    <main id="main-content" className="site-main">
      <div className="site-content">
        <h1 className="blog-title">Tag: {name}</h1>
        <PostList posts={items} />
      </div>
    </main>
  );
}
