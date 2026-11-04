import { listPublicPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';
import SearchForm from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp?.q ?? '').trim();
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);

  let items: PublicPost[] = [];
  let totalPages = 1;
  let error = false;
  if (query) {
    try {
      const data = await listPublicPosts({ search: query, page, perPage: 10 });
      items = data?.items ?? [];
      totalPages = data?.pagination.totalPages ?? 1;
    } catch {
      error = true;
    }
  }

  return (
    <main id="main-content" className="site-main">
      <div className="site-content">
        <h1 className="blog-title">
          {query ? (
            <>Search results for: &ldquo;{query}&rdquo;</>
          ) : (
            <>Search results for: &ldquo;&rdquo;</>
          )}
        </h1>
        <SearchForm query={query} />
        {error ? (
          <p role="status" className="status">
            We couldn&rsquo;t run that search right now. Please try again later.
          </p>
        ) : !query ? (
          <p role="status" className="status">
            Type a question above to search the site.
          </p>
        ) : items.length === 0 ? (
          <p role="status" className="status">
            Sorry, but nothing matched your search terms. Please try again with some different
            keywords.
          </p>
        ) : (
          <PostList posts={items} />
        )}
        {!error && totalPages > 1 ? (
          <nav className="pagination" aria-label="Search pagination">
            {page > 1 ? (
              <a href={`/search?q=${encodeURIComponent(query)}&page=${page - 1}`}>Previous</a>
            ) : null}
            <span className="pagination-status">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <a href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`}>Next</a>
            ) : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
