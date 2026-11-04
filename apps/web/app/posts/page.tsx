import Link from 'next/link';
import { listPublishedPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';

const FRIENDLY_ERROR =
  'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });
}

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

  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

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
            No posts published yet. Nothing to read yet.
          </p>
        ) : (
          <ul className="post-list">
            {items.map((post) => {
              const date = formatDate(post.publishedAt);
              return (
                <li key={post.id} className="post-item">
                  <h2 className="post-title">
                    <Link href={`/posts/${post.slug}`}>{post.title}</Link>
                  </h2>
                  {post.excerpt ? <p className="post-excerpt">{post.excerpt}</p> : null}
                  {date ? (
                    <p className="post-date">
                      <time dateTime={post.publishedAt ?? undefined}>{date}</time>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!error && totalPages > 1 ? (
          <nav className="pagination" aria-label="Posts pagination">
            {prevPage ? <Link href={`/posts?page=${prevPage}`}>Previous</Link> : null}
            <span className="pagination-status">
              Page {page} of {totalPages}
            </span>
            {nextPage ? <Link href={`/posts?page=${nextPage}`}>Next</Link> : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
