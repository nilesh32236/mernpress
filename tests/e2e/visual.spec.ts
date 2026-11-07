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

const ADMIN_URL = 'http://127.0.0.1:5173/admin/';
const adminUsername = 'visual_admin';
const password = 'Visual-E2E-2026-strong!';

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for visual regression tests');
  }
  const env = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    NODE_ENV: 'test',
    MERNPRESS_ADMIN_PASSWORD: password,
  };
  // Earlier suites (content, editor, terms) leave extra published posts and
  // users behind. Start from the same reset state the E2E runner uses so the
  // home/blog/search captures do not depend on test order.
  execFileSync('pnpm', ['db:reset:test'], { cwd: repoRoot, env, stdio: 'pipe' });
  execFileSync('pnpm', ['db:seed'], { cwd: repoRoot, env, stdio: 'pipe' });
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      // Fixed timestamps keep the baselines independent of the run date; the
      // demo post shows its published date on home/blog/search captures.
      "UPDATE posts SET status = 'PUBLISHED', published_at = '2026-11-06T12:00:00Z', updated_at = '2026-11-06T12:00:00Z' WHERE slug IN ('welcome-to-mernpress', 'about');",
    ],
    { stdio: 'pipe' },
  );
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'administrator'); DELETE FROM users WHERE role = 'administrator';",
    ],
    { stdio: 'pipe' },
  );
  execFileSync('pnpm', ['auth:bootstrap', '--username', adminUsername], {
    cwd: repoRoot,
    env,
    stdio: 'pipe',
  });
  const published = execFileSync(
    'psql',
    [testDatabaseUrl, '-t', '-A', '-c', "SELECT count(*) FROM posts WHERE status = 'PUBLISHED';"],
    { encoding: 'utf8' },
  ).trim();
  if (published !== '2') {
    throw new Error(`visual fixtures: expected 2 published rows, found ${published}`);
  }
});

test.afterAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) return;
  // Leave the test database clean for later suites and local runs.
  execFileSync('pnpm', ['db:reset:test'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    },
    stdio: 'pipe',
  });
});

async function settle(page: Page) {
  // The Next dev overlay lives in a custom element and can show an issues badge
  // when a page logs an error; it never renders in production, so hide the host
  // before capturing.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
  });
  await page.waitForTimeout(250);
}

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(ADMIN_URL);
  await page.getByLabel('Username or Email Address').fill(adminUsername);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

const publicScreens: Array<[string, string, string | RegExp]> = [
  ['home', '/', 'Blog'],
  ['blog', '/posts', 'Blog'],
  ['single', '/posts/welcome-to-mernpress', 'Welcome to MERNPress'],
  ['search', '/search?q=mernpress', /Search results for/],
  ['about', '/about', 'About'],
  ['404', '/public-visual-missing', 'Page not found'],
];

test('public visual baselines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await revalidatePublicContent(page);
  for (const [name, route, heading] of publicScreens) {
    await page.goto(`${SITE}${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`${name}-desktop.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.001,
    });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const [name, route, heading] of publicScreens) {
    await page.goto(`${SITE}${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`${name}-mobile.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.001,
    });
  }
});

test('admin visual baselines', async ({ page }) => {
  await login(page);

  const desktopScreens: Array<[string, string, string]> = [
    ['themes', '/admin/themes', 'Themes'],
    ['add-plugins', '/admin/plugins/new', 'Add Plugins'],
    ['add-user', '/admin/users?action=add', 'Add User'],
    ['connectors', '/admin/settings/connectors', 'Connectors'],
    ['mail-delivery', '/admin/settings#discussion', 'Discussion Settings'],
  ];
  for (const [name, route, heading] of desktopScreens) {
    await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    if (name === 'connectors') {
      await expect(page.getByText('OpenAI', { exact: true })).toBeVisible();
    }
    if (name === 'mail-delivery') {
      await expect(page.getByText('Transport:')).toBeVisible();
    }
    await settle(page);
    await expect(page).toHaveScreenshot(`${name}-desktop.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      maxDiffPixelRatio: 0.001,
    });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const [name, route, heading] of [
    ['themes', '/admin/themes', 'Themes'],
    ['add-plugins', '/admin/plugins/new', 'Add Plugins'],
    ['add-user', '/admin/users?action=add', 'Add User'],
  ] as const) {
    await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`${name}-mobile.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      maxDiffPixelRatio: 0.001,
    });
  }
});
