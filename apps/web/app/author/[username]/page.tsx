import { listPublicPosts } from '@/lib/api';
import type { PublicPost } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';
import JsonLd from '@/components/JsonLd';
import { breadcrumbSchema, profileSchema } from '@/lib/seo';
import { siteUrl } from '@/lib/api';
import { requestThemeStrings } from '@/lib/theme-strings';

export default async function AuthorArchive({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);
  const strings = await requestThemeStrings();

  let items: PublicPost[] = [];
  let totalPages = 1;
  let error = false;
  try {
    const data = await listPublicPosts({ author: username, page, perPage: 10 });
    items = data?.items ?? [];
    totalPages = data?.pagination.totalPages ?? 1;
  } catch {
    error = true;
  }

  const profileUrl = `${siteUrl()}/author/${username}`;
  return (
    <main id="main-content" className="site-main">
      <JsonLd data={profileSchema(siteUrl(), username)} />
      <JsonLd
        data={breadcrumbSchema(siteUrl(), [
          { name: 'Home', url: siteUrl() },
          { name: `Author: ${username}`, url: profileUrl },
        ])}
      />
      <div className="site-content">
        <h1 className="blog-title">
          {strings.authorArchive}: {username}
        </h1>
        {error ? (
          <p role="status" className="status">
            We couldn&rsquo;t load this author right now. Please try again later.
          </p>
        ) : items.length > 0 ? (
          <PostList posts={items} strings={strings} />
        ) : (
          <p role="status" className="status archive-empty">
            {strings.noResults}
          </p>
        )}
        {!error ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath={`/author/${username}`}
            strings={strings}
          />
        ) : null}
      </div>
    </main>
  );
}
