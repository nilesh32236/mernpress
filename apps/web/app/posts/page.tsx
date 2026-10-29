import Link from 'next/link';
import { listPublishedPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';

const FRIENDLY_ERROR = 'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);

  let items: PublicPost[] = [];
  let total = 0;
  let totalPages = 1;
  let error = false;
  try {
    const data = await listPublishedPosts(page, 10);
    items = data?.items ?? [];
    total = data?.pagination.total ?? 0;
    totalPages = data?.pagination.totalPages ?? 1;
  } catch {
    error = true;
  }

  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  return (
    <main id="main-content" className="container py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Posts</h1>
        {!error ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {total} {total === 1 ? 'post' : 'posts'}
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="status" className="text-slate-600 dark:text-slate-300">
          {FRIENDLY_ERROR}
        </p>
      ) : items.length === 0 ? (
        <p role="status" className="text-slate-600 dark:text-slate-300">
          No posts published yet. Nothing to read yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {items.map((post) => (
            <li key={post.id} className="border-b border-slate-200 pb-6 dark:border-slate-700">
              <h2 className="text-xl font-semibold">
                <Link href={`/posts/${post.slug}`} className="hover:underline focus-visible:underline">
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

      {!error && (prevPage || nextPage) ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center gap-4">
          {prevPage ? (
            <Link
              href={`/posts?page=${prevPage}`}
              className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Previous
            </Link>
          ) : null}
          {nextPage ? (
            <Link
              href={`/posts?page=${nextPage}`}
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
