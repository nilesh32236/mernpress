import Link from 'next/link';
import type { PublicPost } from '@/lib/api';

interface ArchiveListProps {
  /** Heading shown above the list, e.g. "Search results for "hello"". */
  title: string;
  subtitle?: string | null;
  items: PublicPost[];
  page: number;
  totalPages: number;
  /** Base route used to build pagination links. */
  basePath: string;
  /** Extra query params (e.g. { q: 'hello' }) preserved across pages. */
  params?: Record<string, string>;
}

function pageHref(basePath: string, params: Record<string, string>, page: number): string {
  const search = new URLSearchParams(params);
  search.set('page', String(page));
  return `${basePath}?${search.toString()}`;
}

export default function ArchiveList({
  title,
  subtitle,
  items,
  page,
  totalPages,
  basePath,
  params = {},
}: ArchiveListProps) {
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  return (
    <main id="main-content" className="container py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p role="status" className="text-slate-600 dark:text-slate-300">
          Nothing matched. Try a different search or browse the posts list.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {items.map((post) => (
            <li key={post.id} className="border-b border-slate-200 pb-6 dark:border-slate-700">
              <h2 className="text-xl font-semibold">
                <Link
                  href={`/posts/${encodeURIComponent(post.slug)}`}
                  className="hover:underline focus-visible:underline"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {post.publishedAt
                  ? new Date(post.publishedAt).toLocaleString('en-US', {
                      timeZone: 'UTC',
                      dateStyle: 'medium',
                    })
                  : null}
              </p>
              {post.excerpt ? (
                <p className="mt-2 text-slate-700 dark:text-slate-200">{post.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {prevPage || nextPage ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center gap-4">
          {prevPage ? (
            <Link
              href={pageHref(basePath, params, prevPage)}
              className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Previous
            </Link>
          ) : null}
          {nextPage ? (
            <Link
              href={pageHref(basePath, params, nextPage)}
              className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
