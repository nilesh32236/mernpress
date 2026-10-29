import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPreviewByToken } from '@/lib/api';
import PostView from '@/components/PostView';

export const dynamic = 'force-dynamic';

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let post = null;
  let error = false;
  try {
    post = await getPreviewByToken(token);
  } catch {
    error = true;
  }
  if (error) {
    return (
      <main id="main-content" className="container py-12">
        <p role="status" className="text-slate-600 dark:text-slate-300">
          We couldn’t load this preview right now. Please try again later.
        </p>
      </main>
    );
  }
  if (!post) notFound();
  return (
    <>
      <div className="preview-banner" role="status">
        You are viewing a preview of unpublished content. It is not publicly indexed and the link
        can be revoked at any time.
      </div>
      <PostView post={post} />
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Preview',
    robots: { index: false, follow: false },
  };
}
