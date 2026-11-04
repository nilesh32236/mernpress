import Link from 'next/link';
import { mediaUrl, type PublicPost } from '@/lib/api';
import MorePosts from './MorePosts';

export default function PostView({
  post,
  morePosts = [],
}: {
  post: PublicPost;
  morePosts?: PublicPost[];
}) {
  const isPage = post.type === 'page';
  const author = post.author?.username ?? null;
  const categories = post.terms.categories;
  const tags = post.terms.tags;

  // WordPress's single-post template shows the previous (older) and next
  // (newer) posts around the current one.
  const currentIndex = morePosts.findIndex((entry) => entry.id === post.id);
  const newer = currentIndex > 0 ? morePosts[currentIndex - 1] : undefined;
  const older = currentIndex >= 0 ? morePosts[currentIndex + 1] : undefined;

  const featured = post.featuredImage ? (
    <figure className="entry-featured">
      <img
        src={mediaUrl(post.featuredImage.derivatives['1200'] ?? post.featuredImage.url)}
        alt={post.featuredImage.altText}
        width={post.featuredImage.width ?? undefined}
        height={post.featuredImage.height ?? undefined}
      />
    </figure>
  ) : null;

  return (
    <main id="main-content" className="site-main">
      <article className={`site-content entry${isPage ? ' page' : ''}`}>
        {isPage ? featured : null}
        <h1 className="entry-title">{post.title}</h1>
        {!isPage ? featured : null}
        {!isPage ? (
          <div className="entry-meta">
            <span>Written by </span>
            {author ? <Link href={`/author/${encodeURIComponent(author)}`}>{author}</Link> : null}
            <span> in </span>
            {categories.length > 0 ? (
              categories.map((term, index) => (
                <span key={term.id}>
                  {index > 0 ? ', ' : ''}
                  <Link className="entry-category" href={`/category/${term.slug}`}>
                    {term.name}
                  </Link>
                </span>
              ))
            ) : (
              <span>Uncategorized</span>
            )}
          </div>
        ) : null}
        <div className="entry-content" dangerouslySetInnerHTML={{ __html: post.renderedContent }} />
        {!isPage && tags.length > 0 ? (
          <div className="entry-tags">
            {tags.map((term, index) => (
              <span key={term.id}>
                {index > 0 ? '  ' : ''}
                <Link href={`/tag/${term.slug}`}>{term.name}</Link>
              </span>
            ))}
          </div>
        ) : null}
      </article>

      {!isPage ? (
        <>
          <div className="entry-wide">
            <nav className="post-navigation" aria-label="Post navigation">
              <span className="post-navigation-slot">
                {older ? (
                  <Link className="post-navigation-link" href={`/posts/${older.slug}`}>
                    <span aria-hidden="true">←</span> {older.title}
                  </Link>
                ) : null}
              </span>
              <span className="post-navigation-slot is-next">
                {newer ? (
                  <Link className="post-navigation-link" href={`/posts/${newer.slug}`}>
                    {newer.title} <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </span>
            </nav>
          </div>

          <MorePosts posts={morePosts} />
        </>
      ) : null}
    </main>
  );
}
