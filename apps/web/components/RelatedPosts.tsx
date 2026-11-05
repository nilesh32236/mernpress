import Link from 'next/link';
import { postHref, type PublicPost } from '@/lib/api';
import { readingTime } from '@/lib/reading-time';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Related posts for the single-post template: same primary category when one
 * exists, otherwise the newest posts (the caller decides). Read time is shown
 * so readers can judge the commitment before clicking.
 */
export default function RelatedPosts({
  posts,
  heading = 'Related posts',
}: {
  posts: PublicPost[];
  heading?: string;
}) {
  if (posts.length === 0) return null;
  return (
    <section className="entry-wide related-posts" aria-labelledby="related-posts-heading">
      <h2 id="related-posts-heading">{heading}</h2>
      <ul className="related-posts-list">
        {posts.slice(0, 3).map((post) => {
          const date = formatDate(post.publishedAt);
          const { minutes } = readingTime(post.renderedContent);
          return (
            <li key={post.id} className="related-post">
              <Link className="related-post-title" href={postHref(post)}>
                {post.title}
              </Link>
              <p className="related-post-meta">
                {date ? <time dateTime={post.publishedAt ?? undefined}>{date}</time> : null}
                {date ? ' · ' : null}
                {minutes} min read
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
