import Link from 'next/link';
import { postHref, type PublicPost } from '@/lib/api';
import { DEFAULT_THEME_STRINGS, type ThemeStrings } from '@mernpress/contracts';
import { formatPublicDate } from '@/lib/date';

/** Twenty Twenty-Five "More posts" pattern: title + date, four most recent. */
export default function MorePosts({
  posts,
  strings = DEFAULT_THEME_STRINGS,
}: {
  posts: PublicPost[];
  strings?: ThemeStrings;
}) {
  if (posts.length === 0) return null;
  return (
    <section className="entry-wide more-posts" aria-labelledby="more-posts-heading">
      <h2 id="more-posts-heading">{strings.morePosts}</h2>
      <ul>
        {posts.slice(0, 4).map((post) => {
          const date = formatPublicDate(post.publishedAt, strings.dateLocale);
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
