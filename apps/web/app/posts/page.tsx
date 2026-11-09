import type { Metadata } from 'next';
import { getSiteSettings, listPublishedPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';
import JsonLd from '@/components/JsonLd';
import { breadcrumbSchema, collectionSchema } from '@/lib/seo';
import { siteUrl } from '@/lib/api';
import { requestThemeStrings } from '@/lib/theme-strings';

const FRIENDLY_ERROR =
  'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);
  const strings = await requestThemeStrings();

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

  const home = `${siteUrl()}/posts`;
  return (
    <main id="main-content" className="site-main">
      <JsonLd
        data={collectionSchema(siteUrl(), {
          url: home,
          name: 'Blog',
          posts: items,
        })}
      />
      <JsonLd
        data={breadcrumbSchema(siteUrl(), [
          { name: 'Home', url: siteUrl() },
          { name: 'Blog', url: home },
        ])}
      />
      <div className="site-content">
        <h1 className="blog-title">{strings.blog}</h1>

        {error ? (
          <p role="status" className="status">
            {FRIENDLY_ERROR}
          </p>
        ) : items.length === 0 ? (
          <p role="status" className="status">
            {page === 1 ? strings.noPosts : strings.noResults}
          </p>
        ) : (
          <PostList posts={items} strings={strings} />
        )}
      </div>
      {!error ? (
        <Pagination page={page} totalPages={totalPages} basePath="/posts" strings={strings} />
      ) : null}
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings().catch(() => null);
  return {
    title: `${settings?.siteTitle ?? 'MERNPress'} — Blog`,
    description: settings?.tagline ?? undefined,
    alternates: { canonical: `${siteUrl()}/posts` },
  };
}
