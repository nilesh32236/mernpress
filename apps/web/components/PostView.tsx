import Link from 'next/link';
import { postPath, type PublicPost } from '@/lib/api';
import ResponsiveImage from './ResponsiveImage';
import RelatedPosts from './RelatedPosts';
import { readingTime } from '@/lib/reading-time';
import Comments from './Comments';
import PasswordForm from './PasswordForm';

export default function PostView({
  post,
  morePosts = [],
  relatedPosts = [],
  base = 'posts',
}: {
  post: PublicPost;
  morePosts?: PublicPost[];
  /** Same-category posts; falls back to `morePosts` when empty. */
  relatedPosts?: PublicPost[];
  base?: string;
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

  const read = readingTime(post.renderedContent);
  const related =
    relatedPosts.length > 0
      ? relatedPosts
      : morePosts.filter((entry) => entry.id !== post.id).slice(0, 3);

  const featured = post.featuredImage ? (
    <figure className="entry-featured">
      <ResponsiveImage
        image={post.featuredImage}
        sizes="(max-width: 760px) 100vw, 760px"
        loading="eager"
        fetchPriority="high"
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
            <span aria-hidden="true"> · </span>
            <span>{read.minutes} min read</span>
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
        {post.passwordProtected ? (
          <PasswordForm slug={post.slug} />
        ) : (
          <div
            className={`entry-content format-${post.format}`}
            dangerouslySetInnerHTML={{ __html: post.renderedContent }}
          />
        )}
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
                  <Link className="post-navigation-link" href={postPath(older.slug, base)}>
                    <span aria-hidden="true">←</span> {older.title}
                  </Link>
                ) : null}
              </span>
              <span className="post-navigation-slot is-next">
                {newer ? (
                  <Link className="post-navigation-link" href={postPath(newer.slug, base)}>
                    {newer.title} <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </span>
            </nav>
          </div>

          <Comments postId={post.id} postTitle={post.title} />
          <RelatedPosts
            posts={related}
            base={base}
            heading={relatedPosts.length > 0 ? 'Related posts' : 'More posts'}
          />
        </>
      ) : null}
    </main>
  );
}
