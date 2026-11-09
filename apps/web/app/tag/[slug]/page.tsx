import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicTerm, getSiteSettings, listPublicPosts } from '@/lib/api';
import type { PublicPost, PublicTermInfo } from '@/lib/api';
import PostList from '@/components/PostList';
import Pagination from '@/components/Pagination';
import JsonLd from '@/components/JsonLd';
import { breadcrumbSchema, collectionSchema } from '@/lib/seo';
import { siteUrl } from '@/lib/api';
import { termPath } from '@mernpress/contracts';
import { requestThemeStrings } from '@/lib/theme-strings';

export default async function TagArchive({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page ?? 1) || 1);
  let term: PublicTermInfo | null;
  try {
    term = await getPublicTerm('tag', slug);
  } catch {
    return (
      <main id="main-content" className="site-main">
        <div className="site-content">
          <p role="status" className="status">
            We couldn&rsquo;t load this tag right now. Please try again later.
          </p>
        </div>
      </main>
    );
  }
  if (!term) notFound();

  let items: PublicPost[];
  let totalPages: number;
  try {
    const data = await listPublicPosts({ tag: slug, page, perPage: 10 });
    items = data?.items ?? [];
    totalPages = data?.pagination.totalPages ?? 1;
  } catch {
    return (
      <main id="main-content" className="site-main">
        <div className="site-content">
          <p role="status" className="status">
            We couldn&rsquo;t load this tag right now. Please try again later.
          </p>
        </div>
      </main>
    );
  }

  const settings = await getSiteSettings().catch(() => null);
  const strings = await requestThemeStrings(settings);
  const archiveUrl = `${siteUrl()}${termPath('tag', slug, {
    tagBase: settings?.tagBase ?? 'tag',
  })}`;
  return (
    <main id="main-content" className="site-main">
      <JsonLd
        data={collectionSchema(siteUrl(), {
          url: archiveUrl,
          name: `Tag: ${term.name}`,
          description: term.description,
          posts: items,
        })}
      />
      <JsonLd
        data={breadcrumbSchema(siteUrl(), [
          { name: 'Home', url: siteUrl() },
          { name: `Tag: ${term.name}`, url: archiveUrl },
        ])}
      />
      <div className="site-content">
        <h1 className="blog-title">
          {strings.tagArchive}: {term.name}
        </h1>
        {term.description ? <p className="archive-description">{term.description}</p> : null}
        {items.length > 0 ? (
          <PostList posts={items} strings={strings} />
        ) : (
          <p role="status" className="status archive-empty">
            {strings.noResults}
          </p>
        )}
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        basePath={`${termPath('tag', slug, { tagBase: settings?.tagBase ?? 'tag' })}`}
        strings={strings}
      />
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [term, settings] = await Promise.all([
    getPublicTerm('tag', slug).catch(() => null),
    getSiteSettings().catch(() => null),
  ]);
  if (!term) return { title: 'Tag not found', robots: { index: false, follow: false } };
  return {
    title: `Tag: ${term.name}`,
    description: term.description ?? `Posts tagged ${term.name}.`,
    alternates: {
      canonical: `${siteUrl()}${termPath('tag', term.slug, {
        tagBase: settings?.tagBase ?? 'tag',
      })}`,
    },
  };
}
