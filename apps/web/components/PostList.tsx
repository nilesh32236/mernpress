import Link from 'next/link';
import { postHref, type PublicPost } from '@/lib/api';
import ResponsiveImage from './ResponsiveImage';
import { readingTime } from '@/lib/reading-time';
import { DEFAULT_THEME_STRINGS, type ThemeStrings } from '@mernpress/contracts';
import { formatPublicDate } from '@/lib/date';

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
export default function PostList({
  posts,
  strings = DEFAULT_THEME_STRINGS,
}: {
  posts: PublicPost[];
  strings?: ThemeStrings;
}) {
  return (
    <ul className="post-list">
      {posts.map((post) => {
        const date = formatPublicDate(post.publishedAt, strings.dateLocale);
        const excerpt = excerptText(post);
        const read = readingTime(post.renderedContent);
        return (
          <li key={post.id} className="post-item">
            {post.featuredImage ? (
              <figure className="post-featured">
                <Link href={postHref(post)}>
                  <ResponsiveImage
                    image={post.featuredImage}
                    sizes="(max-width: 760px) 100vw, 720px"
                  />
                </Link>
              </figure>
            ) : null}
            <h2 className="post-title">
              <Link href={postHref(post)}>{post.title}</Link>
            </h2>
            {excerpt ? <p className="post-excerpt">{excerpt}</p> : null}
            {date ? (
              <p className="post-date">
                <Link href={postHref(post)}>
                  <time dateTime={post.publishedAt ?? undefined}>{date}</time>
                </Link>
                <span aria-hidden="true"> · </span>
                <span>
                  {read.minutes} {strings.minRead}
                </span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
