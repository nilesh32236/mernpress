import Link from 'next/link';
import type { PublicPost } from '@/lib/api';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** WordPress query loop used by the blog, archives and search results. */
export default function PostList({ posts }: { posts: PublicPost[] }) {
  return (
    <ul className="post-list">
      {posts.map((post) => {
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
  );
}
