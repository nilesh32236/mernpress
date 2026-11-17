import type { Metadata } from 'next';
import ArchiveList from '@/components/ArchiveList';
import { listByTag, type PublicPost } from '@/lib/api';

const FRIENDLY_ERROR =
  'We couldn\u2019t load content right now. Content is temporarily unavailable. Please try again later.';

interface ArchiveProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

function decode(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function termName(posts: PublicPost[], slug: string, taxonomy: 'categories' | 'tags'): string {
  const match = posts.flatMap((post) => post.terms[taxonomy]).find((term) => term.slug === slug);
  return match?.name ?? slug;
}

async function loadArchive(
  slug: string,
  page: number,
): Promise<{
  items: PublicPost[];
  totalPages: number;
  error: boolean;
}> {
  try {
    const data = await listByTag(slug, page, 10);
    return {
      items: data?.items ?? [],
      totalPages: data?.pagination.totalPages ?? 1,
      error: false,
    };
  } catch {
    return { items: [], totalPages: 1, error: true };
  }
}

export default async function TagArchive({ params, searchParams }: ArchiveProps) {
  const { slug: rawSlug } = await params;
  const sp = await searchParams;
  const slug = decode(rawSlug);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, totalPages, error } = await loadArchive(slug, page);

  if (error) {
    return (
      <main id="main-content" className="container py-12">
        <p role="status" className="text-slate-600 dark:text-slate-300">
          {FRIENDLY_ERROR}
        </p>
      </main>
    );
  }

  return (
    <ArchiveList
      title={`Tag: ${termName(items, slug, 'tags')}`}
      subtitle={`${items.length} ${items.length === 1 ? 'post' : 'posts'}`}
      items={items}
      page={page}
      totalPages={totalPages}
      basePath={`/tag/${encodeURIComponent(slug)}`}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decode(rawSlug);
  const { items } = await loadArchive(slug, 1).catch(() => ({ items: [] as PublicPost[] }));
  return { title: `Tag: ${termName(items, slug, 'tags')}` };
}
