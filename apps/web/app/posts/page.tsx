import { listPublishedPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';

const FRIENDLY_ERROR =
  'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);

  let items: PublicPost[] = [];
  let totalPages = 1;
  let error = false;
  try {
    const data = await listPublishedPosts(page, 10);
    items = data?.items ?? [];
    totalPages = data?.pagination.totalPages ?? 1;
  } catch {
    error = true;
  }

  return (
    <main id="main-content" className="site-main">
      <div className="site-content">
        <h1 className="blog-title">Blog</h1>

        {error ? (
          <p role="status" className="status">
            {FRIENDLY_ERROR}
          </p>
        ) : items.length === 0 ? (
          <p role="status" className="status">
            Sorry, but nothing was found. Please try a search with different keywords.
          </p>
        ) : (
          <PostList posts={items} />
        )}

      </div>
      {!error ? <Pagination page={page} totalPages={totalPages} basePath="/posts" /> : null}
    </main>
  );
}
