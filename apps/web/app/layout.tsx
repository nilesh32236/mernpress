import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Manrope } from 'next/font/google';
import { listPublicPosts } from '@/lib/api';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'MERNPress', template: '%s | MERNPress' },
  description: 'MERNPress public site.',
  alternates: {
    types: { 'application/rss+xml': '/feed' },
  },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  let pageLinks: Array<{ id: string; title: string; slug: string }> = [];
  try {
    const pages = await listPublicPosts({ type: 'page', perPage: 6 });
    pageLinks = pages?.items ?? [];
  } catch {
    // The nav/footer still render when the API is unavailable.
  }

  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="site-title">
            MERNPress
          </Link>
          <nav className="site-nav" aria-label="Primary">
            <Link href="/posts">Blog</Link>
            {pageLinks.map((page) => (
              <Link key={page.id} href={`/${page.slug}`}>
                {page.title}
              </Link>
            ))}
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <div className="site-footer-top">
            <Link href="/" className="site-footer-title">
              MERNPress
            </Link>
            <div className="site-footer-navs">
              <nav className="site-footer-nav" aria-label="Footer">
                <Link href="/posts">Blog</Link>
                <Link href="/">Home</Link>
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
          <p className="site-footer-credit">Designed with MERNPress</p>
        </footer>
      </body>
    </html>
  );
}
