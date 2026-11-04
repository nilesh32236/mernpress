import { getPermalinkBase, listPublicPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';
import MorePosts from '@/components/MorePosts';
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
  let morePosts: PublicPost[] = [];
  let totalPages = 1;
  let error = false;
  try {
    const more = await listPublicPosts({ type: 'post', page: 1, perPage: 4 });
    morePosts = more?.items ?? [];
  } catch {
    // The "More posts" section is supplementary.
  }
  if (query) {
    try {
      const data = await listPublicPosts({ search: query, page, perPage: 10 });
      items = data?.items ?? [];
      totalPages = data?.pagination.totalPages ?? 1;
    } catch {
      error = true;
    }
  }

  const base = await getPermalinkBase();

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
          <p role="status" className="status search-status">
            We couldn&rsquo;t run that search right now. Please try again later.
          </p>
        ) : !query ? (
          <p role="status" className="status search-status">
            Type a question above to search the site.
          </p>
        ) : items.length === 0 ? (
          <p role="status" className="status search-status">
            Sorry, but nothing was found. Please try a search with different keywords.
          </p>
        ) : (
          <PostList posts={items} base={base} />
        )}
      </div>
      {!error ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/search"
          query={query ? { q: query } : {}}
        />
      ) : null}
      <MorePosts posts={morePosts} base={base} />
    </main>
  );
}
