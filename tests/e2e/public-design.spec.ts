import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const SITE = 'http://127.0.0.1:3000';

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for the public design tests');
  }
  execFileSync('pnpm', ['db:seed'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });
  // Demo content is created as drafts; publish the known fixtures for public
  // route measurements without exposing the internal content service.
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      "UPDATE posts SET status = 'PUBLISHED', published_at = now(), updated_at = now() WHERE slug IN ('welcome-to-mernpress', 'about');",
    ],
    { stdio: 'pipe' },
  );
});

type Screen = {
  name: string;
  path: string;
  heading: string | RegExp;
  status?: number;
  mobileShot?: boolean;
};

const screens: Screen[] = [
  { name: 'home', path: '/', heading: 'Blog', mobileShot: true },
  { name: 'blog', path: '/posts', heading: 'Blog' },
  {
    name: 'single',
    path: '/posts/welcome-to-mernpress',
    heading: 'Welcome to MERNPress',
    mobileShot: true,
  },
  { name: 'page', path: '/about', heading: 'About', mobileShot: true },
  { name: 'category', path: '/category/news', heading: /Category: News/ },
  { name: 'tag', path: '/tag/demo', heading: /Tag: Demo/ },
  { name: 'author', path: '/author/public-author', heading: /Author: public-author/ },
  { name: 'search', path: '/search?q=mernpress', heading: /Search results for/, mobileShot: true },
  {
    name: '404',
    path: '/public-design-not-found',
    heading: 'Page not found',
    status: 404,
    mobileShot: true,
  },
];

async function measurements(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: Math.round(box.left),
        width: Math.round(box.width),
        font: style.fontSize,
        weight: style.fontWeight,
      };
    };
    return {
      h1: rect('h1'),
      content: rect('.site-content'),
      header: rect('header'),
      search: rect('.search-form, form[role=search]'),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
}

test('public screens keep the Twenty Twenty-Five layout contract', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const screen of screens) {
    const response = await page.goto(`${SITE}${screen.path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
    if (screen.status) expect(response?.status()).toBe(screen.status);

    const metrics = await measurements(page);
    expect(metrics.h1?.font, `${screen.name} h1`).toBe('48px');
    expect(metrics.h1?.weight).toBe('400');
    expect(metrics.scrollWidth, `${screen.name} desktop overflow`).toBeLessThanOrEqual(
      metrics.innerWidth,
    );
    if (screen.name === 'home' || screen.name === 'blog') {
      expect(metrics.h1?.x).toBe(398);
      expect(metrics.h1?.width).toBe(645);
      expect(metrics.header?.width).toBe(1440);
    }
    if (screen.name === 'search') {
      expect(metrics.search).toMatchObject({ x: 398, width: 645 });
    }

    await testInfo.attach(`${screen.name}-desktop`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  }

  // Feed and sitemap are XML surfaces: verify type/status and link integrity.
  const feed = await page.request.get(`${SITE}/feed`);
  expect(feed.status()).toBe(200);
  expect(feed.headers()['content-type']).toContain('application/rss+xml');
  const sitemap = await page.request.get(`${SITE}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('xml');
  expect(await sitemap.text()).toContain('/posts/welcome-to-mernpress');

  // Mobile: 36px titles, no horizontal overflow; page titles previously kept
  // the desktop 48px because `.entry.page .entry-title` outranked the mobile
  // `.entry-title` rule.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const screen of screens) {
    await page.goto(`${SITE}${screen.path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
    const metrics = await measurements(page);
    expect(metrics.h1?.font, `${screen.name} mobile h1`).toBe('36px');
    expect(metrics.scrollWidth, `${screen.name} mobile overflow`).toBeLessThanOrEqual(
      metrics.innerWidth,
    );
    if (screen.mobileShot) {
      await testInfo.attach(`${screen.name}-mobile`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });
    }
  }

  // The page heading is the regression that drove this pass.
  await page.goto(`${SITE}/about`);
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  const pageTitle = await page.evaluate(() => {
    const heading = document.querySelector('.entry.page .entry-title');
    return heading ? getComputedStyle(heading).fontSize : null;
  });
  expect(pageTitle).toBe('36px');
});
