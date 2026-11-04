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
      </div>
    </main>
  );
}
