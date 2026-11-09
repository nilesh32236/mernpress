import { listPublicPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';
import MorePosts from '@/components/MorePosts';
import SearchForm from '@/components/SearchForm';
import { requestThemeStrings } from '@/lib/theme-strings';
import { siteUrl } from '@/lib/api';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp?.q ?? '').trim();
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);
  const strings = await requestThemeStrings();

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

  return (
    <main id="main-content" className="site-main">
      <div className="site-content">
        <h1 className="blog-title">
          {strings.searchResultsFor}: &ldquo;{query}&rdquo;
        </h1>
        <SearchForm query={query} strings={strings} />
        {error ? (
          <p role="status" className="status search-status">
            {strings.searchError}
          </p>
        ) : !query ? (
          <p role="status" className="status search-status">
            {strings.searchHint}
          </p>
        ) : items.length === 0 ? (
          <p role="status" className="status search-status">
            {strings.noResults}
          </p>
        ) : (
          <PostList posts={items} strings={strings} />
        )}
      </div>
      {!error ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/search"
          query={query ? { q: query } : {}}
          strings={strings}
        />
      ) : null}
      <MorePosts posts={morePosts} strings={strings} />
    </main>
  );
}

/**
 * Search results are thin, parameterised URLs; WordPress noindexes them and so
 * does MERNPress. The search form stays reachable, just not indexable.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const query = (sp?.q ?? '').trim();
  return {
    title: query ? `Search results for "${query}"` : 'Search',
    robots: { index: false, follow: true },
    alternates: { canonical: `${siteUrl()}/search` },
  };
}
