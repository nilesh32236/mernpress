import type { PublicPost } from '@/lib/api';

function formatDateUtc(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function PostView({ post }: { post: PublicPost }) {
  const date = formatDateUtc(post.publishedAt);
  return (
    <main id="main-content" className="container py-12">
      <article>
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
          {date ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              <time dateTime={post.publishedAt ?? undefined}>{date} UTC</time>
            </p>
          ) : null}
          {post.terms.categories.length > 0 || post.terms.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1" aria-label="Terms">
              {post.terms.categories.map((term) => (
                <span key={`c-${term.id}`} className="chip">
                  {term.name}
                </span>
              ))}
              {post.terms.tags.map((term) => (
                <span key={`t-${term.id}`} className="chip">
                  {term.name}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <div className="flex flex-col gap-8 lg:flex-row">
          {post.toc.length > 1 ? (
            <aside
              aria-label="Table of contents"
              className="lg:w-56 lg:shrink-0"
            >
              <nav>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  On this page
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {post.toc.map((entry) => (
                    <li key={entry.id} style={{ paddingLeft: `${(entry.level - 1) * 0.75}rem` }}>
                      <a href={`#${entry.id}`} className="hover:underline focus-visible:underline">
                        {entry.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          ) : null}

          <div
            className="prose flex-1"
            dangerouslySetInnerHTML={{ __html: post.renderedContent }}
          />
        </div>
      </article>
    </main>
  );
}
