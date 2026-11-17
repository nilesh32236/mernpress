import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MERNPress', template: '%s | MERNPress' },
  description: 'MERNPress public site.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <header className="container mt-6 flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="text-sm font-semibold hover:underline focus-visible:underline">
            MERNPress
          </a>
          <form action="/search" method="get" className="flex gap-2" role="search">
            <label htmlFor="site-search" className="sr-only">
              Search posts
            </label>
            <input
              id="site-search"
              type="search"
              name="q"
              placeholder="Search posts"
              className="w-48 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="submit"
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Search
            </button>
          </form>
        </header>
        {children}
      </body>
    </html>
  );
}
