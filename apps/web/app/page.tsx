import Link from 'next/link';
import { listPublishedPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';

const FRIENDLY_ERROR = 'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

export default async function HomePage() {
  let items: PublicPost[] = [];
  let error = false;
  try {
    const data = await listPublishedPosts(1, 10);
    items = data?.items ?? [];
  } catch {
    error = true;
  }

  return (
    <main id="main-content" className="container py-12">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
          Public site
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">MERNPress</h1>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
          Latest published posts.
        </p>
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
    </main>
  );
}
