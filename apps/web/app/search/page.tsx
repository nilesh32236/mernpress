import type { Metadata } from 'next';
import ArchiveList from '@/components/ArchiveList';
import { searchPosts, type PublicPost } from '@/lib/api';

const FRIENDLY_ERROR =
  'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

type SearchParams = { q?: string; page?: string };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  let items: PublicPost[] = [];
  let totalPages = 1;
  let error = false;
  if (q) {
    try {
      const data = await searchPosts(q, page, 10);
      items = data?.items ?? [];
      totalPages = data?.pagination.totalPages ?? 1;
    } catch {
      error = true;
    }
  }

  if (error) {
    return (
      <main id="main-content" className="container py-12">
        <p role="status" className="text-slate-600 dark:text-slate-300">
          {FRIENDLY_ERROR}
        </p>
      </main>
    );
  }

  return (
    <>
      <form action="/search" method="get" className="container mt-8 flex gap-2">
        <label htmlFor="archive-search" className="sr-only">
          Search posts
        </label>
        <input
          id="archive-search"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search posts"
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          className="rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900"
        >
          Search
        </button>
      </form>
      <ArchiveList
        title={q ? `Search results for “${q}”` : 'Search'}
        subtitle={q ? `${items.length} ${items.length === 1 ? 'result' : 'results'}` : null}
        items={items}
        page={page}
        totalPages={totalPages}
        basePath="/search"
        params={q ? { q } : {}}
      />
    </>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  return { title: q ? `Search results for “${q}”` : 'Search' };
}
