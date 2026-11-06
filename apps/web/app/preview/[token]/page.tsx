import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPreviewByToken } from '@/lib/api';
import PostView from '@/components/PostView';
import { requestThemeStrings } from '@/lib/theme-strings';

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
      <main id="main-content" className="site-main">
        <div className="site-content">
          <p role="status" className="status">
            We couldn’t load this preview right now. Please try again later.
          </p>
        </div>
      </main>
    );
  }
  if (!post) notFound();
  const strings = await requestThemeStrings();
  return (
    <>
      <div className="preview-banner" role="status">
        You are viewing a preview of unpublished content. It is not publicly indexed and the link
        can be revoked at any time.
      </div>
      <PostView post={post} strings={strings} />
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Preview',
    robots: { index: false, follow: false },
  };
}
