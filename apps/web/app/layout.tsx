import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Manrope } from 'next/font/google';
import { getPublicVitalsSummary, getSiteSettings, listPublicPosts } from '@/lib/api';
import SpeculationRules from '@/components/SpeculationRules';
import './globals.css';
import PublicAdminBar from '@/components/PublicAdminBar';
import JsonLd from '@/components/JsonLd';
import { ViewTracker } from '@/components/ViewTracker';
import { WebVitals } from '@/components/WebVitals';
import { ConsentBanner, ConsentSettingsButton } from '@/components/ConsentBanner';
import ThemeToggle from '@/components/ThemeToggle';
import { DEFAULT_CONSENT, themeStringsFor } from '@mernpress/contracts';
import { COLOR_SCHEME_ATTRIBUTE, COLOR_SCHEME_COOKIE, isColorScheme } from '@/lib/color-scheme';
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
  let vitalsSummary = null;
  try {
    const [pages, site, vitals] = await Promise.all([
      listPublicPosts({ type: 'page', perPage: 6 }),
      getSiteSettings(),
      getPublicVitalsSummary(),
    ]);
    pageLinks = pages?.items ?? [];
    settings = site;
    vitalsSummary = vitals;
  } catch {
    // The nav/footer still render when the API is unavailable.
    pageLinks = [];
  }
  const siteTitle = settings?.siteTitle ?? 'MERNPress';
  const theme = settings?.theme ?? null;
  const consent = settings?.consent ?? DEFAULT_CONSENT;
  const customColors = settings?.customColors ?? null;
  const customMenu = settings?.customMenu ?? null;
  const defaultLanguage = settings?.languages?.default ?? 'en';
  // The edge middleware sets x-mn-language for every rendered request (default
  // or a /<lang>/ variant); the layout selects menus and chrome strings. When
  // the layout is rendered outside a request (unit tests) the default applies.
  let requestLanguage: string;
  try {
    requestLanguage = (await headers()).get('x-mn-language') ?? defaultLanguage;
  } catch {
    requestLanguage = defaultLanguage;
  }
  const strings = themeStringsFor(settings?.themeStrings ?? null, requestLanguage, defaultLanguage);
  const languageMenu = settings?.languageMenus?.[requestLanguage] ?? null;
  // The colour scheme is a cookie so the server can paint the right palette on
  // the first byte. Without an explicit choice the stylesheet follows the
  // operating system preference (ADR 0064).
  let colorScheme: 'light' | 'dark' | null = null;
  try {
    const raw = (await cookies()).get(COLOR_SCHEME_COOKIE)?.value;
    colorScheme = isColorScheme(raw) ? raw : null;
  } catch {
    // Outside a request (unit tests, static rendering): follow the OS, which
    // is what the null value means.
  }
  // Palettes are published as separate light/dark custom properties so the
  // stylesheet can switch them with one attribute (ADR 0064). Writing
  // `--site-*` inline would win over any stylesheet rule and block the switch.
  const style: Record<string, string> = {};
  if (theme) {
    style['--theme-light-bg'] = theme.tokens.background;
    style['--theme-light-surface'] = theme.tokens.surface;
    style['--theme-light-text'] = theme.tokens.text;
    style['--theme-light-muted'] = theme.tokens.muted;
    style['--theme-light-accent'] = theme.tokens.accent;
    style['--theme-heading-font'] = theme.tokens.headingFont;
    style['--theme-body-font'] = theme.tokens.bodyFont;
    style['--content-width'] = theme.tokens.contentWidth;
    style['--site-radius'] = theme.tokens.radius;
    const dark = theme.tokens.dark;
    if (dark) {
      style['--theme-dark-bg'] = dark.background;
      style['--theme-dark-surface'] = dark.surface;
      style['--theme-dark-text'] = dark.text;
      style['--theme-dark-muted'] = dark.muted;
      style['--theme-dark-accent'] = dark.accent;
    }
  }
  // Customizer colours are the light palette; dark mode uses the theme's own
  // dark colours (documented in ADR 0064).
  if (customColors) {
    if (customColors.background) style['--theme-light-bg'] = customColors.background;
    if (customColors.surface) style['--theme-light-surface'] = customColors.surface;
    if (customColors.text) style['--theme-light-text'] = customColors.text;
    if (customColors.muted) style['--theme-light-muted'] = customColors.muted;
    if (customColors.accent) style['--theme-light-accent'] = customColors.accent;
  }
  const themeStyle = Object.keys(style).length > 0 ? (style as CSSProperties) : undefined;
  const menu =
    languageMenu && languageMenu.length > 0
      ? languageMenu
      : requestLanguage === defaultLanguage && customMenu && customMenu.length > 0
        ? customMenu
        : null;

  return (
    <html
      lang={requestLanguage}
      className={manrope.variable}
      data-theme={theme?.id}
      data-layout={theme?.layout}
      {...(colorScheme ? { [COLOR_SCHEME_ATTRIBUTE]: colorScheme } : {})}
      style={themeStyle}
    >
      <body>
        <ViewTracker consent={consent} />
        <WebVitals consent={consent} />
        <SpeculationRules
          mode={settings?.speculationMode ?? 'off'}
          vitals={vitalsSummary?.vitals ?? []}
        />
        {settings?.customCss ? (
          <style id="customizer-css" dangerouslySetInnerHTML={{ __html: settings.customCss }} />
        ) : null}
        <JsonLd
          data={siteGraph(
            siteUrl(),
            {
              title: siteTitle,
              tagline: settings?.tagline ?? null,
            },
            defaultLanguage,
          )}
        />
        <PublicAdminBar siteTitle={siteTitle} />
        <a href="#main-content" className="skip-link">
          {strings.skipToContent}
        </a>
        <header className="site-header">
          <Link href="/" className="site-title">
            {siteTitle}
          </Link>
          {/* The navigation and the colour switch share one group, so the
              navigation keeps the right-hand edge of the header. The switch
              comes first, so the navigation stays exactly where it was. */}
          <div className="site-header-actions">
            <ThemeToggle
              darkLabel={strings.toggleDarkMode}
              lightLabel={strings.toggleLightMode}
              initialScheme={colorScheme}
            />
            {menu ? (
              <nav className="site-nav" aria-label={strings.primaryNav}>
                {menu.map((item, index) =>
                  item.url.startsWith('/') ? (
                    <Link key={`${item.url}-${index}`} href={item.url}>
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      key={`${item.url}-${index}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.label}
                    </a>
                  ),
                )}
              </nav>
            ) : requestLanguage === defaultLanguage && pageLinks.length > 0 ? (
              <nav className="site-nav" aria-label={strings.primaryNav}>
                {pageLinks.map((page) => (
                  <Link key={page.id} href={`/${page.slug}`}>
                    {page.title}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
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
              <nav className="site-footer-nav" aria-label={strings.footerNav}>
                <Link href="/posts">{strings.blog}</Link>
                <Link href="/">{strings.home}</Link>
                <Link href="/search">{strings.search}</Link>
                <Link href="/feed">{strings.feed}</Link>
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
        <ConsentBanner config={consent} />
        <ConsentSettingsButton config={consent} />
      </body>
    </html>
  );
}
