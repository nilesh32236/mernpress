import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Manrope } from 'next/font/google';
import { getSiteSettings, listPublicPosts } from '@/lib/api';
import './globals.css';
import PublicAdminBar from '@/components/PublicAdminBar';
import JsonLd from '@/components/JsonLd';
import { siteGraph } from '@/lib/seo';
import { siteUrl } from '@/lib/api';

// HTML must never be cached: a stale document can reference static assets
// from a previous release, which then 404 and render the site unstyled.
export const dynamic = 'force-dynamic';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  let settings = null;
  try {
    settings = await getSiteSettings();
  } catch {
    // Fall back to the defaults when the API is unavailable.
  }
  const siteTitle = settings?.siteTitle ?? 'MERNPress';
  return {
    title: { default: siteTitle, template: `%s | ${siteTitle}` },
    description: settings?.tagline || 'MERNPress public site.',
    alternates: {
      types: { 'application/rss+xml': '/feed' },
    },
    twitter: {
      card: 'summary_large_image',
    },
    robots:
      settings?.blogPublic === false
        ? { index: false, follow: false }
        : { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  let pageLinks: Array<{ id: string; title: string; slug: string }>;
  let settings = null;
  try {
    const [pages, site] = await Promise.all([
      listPublicPosts({ type: 'page', perPage: 6 }),
      getSiteSettings(),
    ]);
    pageLinks = pages?.items ?? [];
    settings = site;
  } catch {
    // The nav/footer still render when the API is unavailable.
    pageLinks = [];
  }
  const siteTitle = settings?.siteTitle ?? 'MERNPress';

  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <JsonLd
          data={siteGraph(siteUrl(), {
            title: siteTitle,
            tagline: settings?.tagline ?? null,
          })}
        />
        <PublicAdminBar siteTitle={siteTitle} />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="site-title">
            {siteTitle}
          </Link>
          {pageLinks.length > 0 ? (
            <nav className="site-nav" aria-label="Primary">
              {pageLinks.map((page) => (
                <Link key={page.id} href={`/${page.slug}`}>
                  {page.title}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>
        {children}
        <footer className="site-footer">
          <div className="site-footer-top">
            <div className="site-footer-brand">
              <Link href="/" className="site-footer-title">
                {siteTitle}
              </Link>
              {settings?.tagline ? <p className="site-footer-tagline">{settings.tagline}</p> : null}
            </div>
            <div className="site-footer-navs">
              <nav className="site-footer-nav" aria-label="Footer">
                <Link href="/posts">Blog</Link>
                <Link href="/">Home</Link>
                <Link href="/search">Search</Link>
                <Link href="/feed">Feed</Link>
              </nav>
              {pageLinks.length > 0 ? (
                <nav className="site-footer-nav" aria-label="Pages">
                  {pageLinks.map((page) => (
                    <Link key={page.id} href={`/${page.slug}`}>
                      {page.title}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
          </div>
          <div className="site-footer-bottom">
            <span className="site-footer-theme">MERNPress</span>
            <span className="site-footer-credit">Designed with MERNPress</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
