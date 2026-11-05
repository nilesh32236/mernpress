import Link from 'next/link';
import { postHref, type PublicPost } from '@/lib/api';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Twenty Twenty-Five "More posts" pattern: title + date, four most recent. */
export default function MorePosts({ posts }: { posts: PublicPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="entry-wide more-posts" aria-labelledby="more-posts-heading">
      <h2 id="more-posts-heading">More posts</h2>
      <ul>
        {posts.slice(0, 4).map((post) => {
          const date = formatDate(post.publishedAt);
          return (
            <li key={post.id}>
              <Link className="more-posts-title" href={postHref(post)}>
                {post.title}
              </Link>
              {date ? (
                <Link className="more-posts-date" href={postHref(post)}>
                  <time dateTime={post.publishedAt ?? undefined}>{date}</time>
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
