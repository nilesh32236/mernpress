import { listPublishedPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';
import JsonLd from '@/components/JsonLd';
import { breadcrumbSchema, collectionSchema } from '@/lib/seo';
import { siteUrl } from '@/lib/api';

const FRIENDLY_ERROR =
  'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);
  let items: PublicPost[] = [];
  let totalPages = 1;
  let error = false;
  try {
    const data = await listPublishedPosts(page, 10);
    items = data?.items ?? [];
    totalPages = data?.pagination.totalPages ?? 1;
  } catch {
    error = true;
  }

  return (
    <main id="main-content" className="site-main">
      <JsonLd
        data={collectionSchema(siteUrl(), {
          url: siteUrl(),
          name: 'Blog',
          posts: items,
        })}
      />
      <JsonLd data={breadcrumbSchema(siteUrl(), [{ name: 'Home', url: siteUrl() }])} />
      <div className="site-content">
        <h1 className="blog-title">Blog</h1>

        {error ? (
          <p role="status" className="status">
            {FRIENDLY_ERROR}
          </p>
        ) : items.length === 0 ? (
          <p role="status" className="status">
            Sorry, but nothing was found. Please try a search with different keywords.
          </p>
        ) : (
          <PostList posts={items} />
        )}
      </div>
      {!error ? <Pagination page={page} totalPages={totalPages} basePath="/" /> : null}
    </main>
  );
}
