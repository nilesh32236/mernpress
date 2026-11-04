import Link from 'next/link';
import { mediaUrl, type PublicPost } from '@/lib/api';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function excerptText(post: PublicPost): string | null {
  if (post.excerpt) return post.excerpt;
  const text = post.renderedContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const words = text.split(' ');
  return words.length > 55 ? `${words.slice(0, 55).join(' ')}[…]` : text;
}

/** WordPress query loop used by the blog, archives and search results. */
export default function PostList({ posts }: { posts: PublicPost[] }) {
  return (
    <ul className="post-list">
      {posts.map((post) => {
        const date = formatDate(post.publishedAt);
        const excerpt = excerptText(post);
        return (
          <li key={post.id} className="post-item">
            {post.featuredImage ? (
              <figure className="post-featured">
                <Link href={`/posts/${post.slug}`}>
                  <img
                    src={mediaUrl(post.featuredImage.derivatives['1200'] ?? post.featuredImage.url)}
                    alt={post.featuredImage.altText}
                    width={post.featuredImage.width ?? undefined}
                    height={post.featuredImage.height ?? undefined}
                  />
                </Link>
              </figure>
            ) : null}
            <h2 className="post-title">
              <Link href={`/posts/${post.slug}`}>{post.title}</Link>
            </h2>
            {excerpt ? <p className="post-excerpt">{excerpt}</p> : null}
            {date ? (
              <p className="post-date">
                <Link href={`/posts/${post.slug}`}>
                  <time dateTime={post.publishedAt ?? undefined}>{date}</time>
                </Link>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
