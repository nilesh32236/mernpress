import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const SITE = 'http://127.0.0.1:3000';
const REVALIDATE_SECRET = 'e2e-revalidate-secret-2026-11-06';

/**
 * The API notifies the web cache after API-driven writes. This suite seeds
 * with SQL, so flush the public-content tag explicitly before measuring.
 */
async function revalidatePublicContent(page: Page): Promise<void> {
  const response = await page.request.post(`${SITE}/api/revalidate`, {
    headers: { 'x-revalidate-secret': REVALIDATE_SECRET },
    data: { tags: ['public-content'] },
  });
  expect(response.status()).toBe(200);
}

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
  await revalidatePublicContent(page);
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

  // Mobile: the title follows Twenty Twenty-Five's viewport curve
  // (35.13px at 375, 36.96px at 512, capped at 48px) and never overflows; page
  // titles previously kept the desktop 48px because `.entry.page .entry-title`
  // outranked the mobile `.entry-title` rule.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const screen of screens) {
    await page.goto(`${SITE}${screen.path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
    const metrics = await measurements(page);
    // Allow the 0.2px rounding a browser applies to the clamp curve.
    expect(parseFloat(metrics.h1?.font ?? '0'), `${screen.name} mobile h1`).toBeGreaterThanOrEqual(
      34.9,
    );
    expect(parseFloat(metrics.h1?.font ?? '0')).toBeLessThanOrEqual(35.4);
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
  expect(parseFloat(pageTitle ?? '0')).toBeGreaterThanOrEqual(34.9);
  expect(parseFloat(pageTitle ?? '0')).toBeLessThanOrEqual(35.4);
});

/**
 * Regression: the 404 log must record only genuine 404s.
 *
 * Next.js embeds the `not-found` boundary in the RSC payload of successful
 * pages, so a server-side logging call recorded every visited URL as a 404
 * (production rows for `/posts`, `/posts/testcom`, `/search` and
 * `/author/admin` had hundreds of hits). Logging now happens in a client
 * effect, so it only runs when the 404 UI is actually mounted.
 */
test('only genuine 404s are recorded in the not-found log', async ({ page }) => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const clear = () =>
    execFileSync('psql', [testDatabaseUrl, '-c', 'DELETE FROM not_found_entries;'], {
      stdio: 'pipe',
    });
  const rows = () =>
    execFileSync(
      'psql',
      [testDatabaseUrl, '-t', '-A', '-c', 'SELECT path FROM not_found_entries ORDER BY path;'],
      { stdio: 'pipe' },
    )
      .toString()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  clear();

  // Successful pages must not be logged, on desktop or mobile.
  for (const path of ['/posts', '/posts/welcome-to-mernpress', '/search?q=mernpress', '/about']) {
    const response = await page.goto(`${SITE}${path}`, { waitUntil: 'networkidle' });
    expect(response?.status(), path).toBe(200);
    await page.waitForTimeout(700);
  }
  expect(rows()).toEqual([]);

  // A real 404 is recorded exactly once.
  const missing = await page.goto(`${SITE}/public-design-missing-log`, {
    waitUntil: 'networkidle',
  });
  expect(missing?.status()).toBe(404);
  await expect
    .poll(async () => rows(), { timeout: 10_000 })
    .toEqual(['/public-design-missing-log']);

  // Revisiting increments the counter instead of duplicating the row.
  await page.goto(`${SITE}/public-design-missing-log`, { waitUntil: 'networkidle' });
  await expect
    .poll(
      async () =>
        execFileSync(
          'psql',
          [
            testDatabaseUrl,
            '-t',
            '-A',
            '-c',
            "SELECT hits FROM not_found_entries WHERE path = '/public-design-missing-log';",
          ],
          { stdio: 'pipe' },
        )
          .toString()
          .trim(),
      { timeout: 10_000 },
    )
    .toBe('2');

  clear();
});

/**
 * Comment typography matches the measured WordPress reference (post body 18px,
 * comment meta 14px). The reference theme's single template has no comments
 * block, so the comparison was made against a post containing a comments block.
 */
test('comment body and meta match the WordPress type scale', async ({ page }) => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      `INSERT INTO comments (id, post_id, author_name, author_email, content, status, created_at, updated_at)
       SELECT gen_random_uuid(), id, 'Type Audit', 'type-audit@example.com', 'A comment used to measure the type scale.', 'APPROVED', now(), now()
       FROM posts WHERE slug = 'welcome-to-mernpress' LIMIT 1;`,
    ],
    { stdio: 'pipe' },
  );
  try {
    await revalidatePublicContent(page);
    await page.goto(`${SITE}/posts/welcome-to-mernpress`, { waitUntil: 'domcontentloaded' });
    const comment = page.getByText('A comment used to measure the type scale.');
    await expect(comment).toBeVisible({ timeout: 15_000 });
    const metrics = await page.evaluate(() => {
      const body = document.querySelector('.comment-body p, .comment-body');
      const meta = document.querySelector('.comment-meta, .comment-author');
      return {
        bodyFont: body ? getComputedStyle(body).fontSize : null,
        metaFont: meta ? getComputedStyle(meta).fontSize : null,
      };
    });
    expect(metrics.bodyFont).toBe('18px');
    expect(metrics.metaFont).toBe('14px');
  } finally {
    execFileSync(
      'psql',
      [
        testDatabaseUrl,
        '-c',
        "DELETE FROM comments WHERE author_email = 'type-audit@example.com';",
      ],
      { stdio: 'pipe' },
    );
  }
});
