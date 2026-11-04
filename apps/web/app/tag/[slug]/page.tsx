import { notFound } from 'next/navigation';
import { getPublicTerm, listPublicPosts } from '@/lib/api';
import type { PublicPost, PublicTermInfo } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';

export default async function TagArchive({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);
  let term: PublicTermInfo | null;
  try {
    term = await getPublicTerm('tag', slug);
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
  if (!term) notFound();

  let items: PublicPost[];
  let totalPages = 1;
  try {
    const data = await listPublicPosts({ tag: slug, page, perPage: 10 });
    items = data?.items ?? [];
    totalPages = data?.pagination.totalPages ?? 1;
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

  return (
    <main id="main-content" className="site-main">
      <div className="site-content">
        <h1 className="blog-title">Tag: {term.name}</h1>
        {term.description ? (
          <p className="archive-description">{term.description}</p>
        ) : null}
        {items.length > 0 ? (
          <PostList posts={items} />
        ) : (
          <p role="status" className="status archive-empty">
            Sorry, but nothing was found. Please try a search with different keywords.
          </p>
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} basePath={`/tag/${slug}`} />
    </main>
  );
}
