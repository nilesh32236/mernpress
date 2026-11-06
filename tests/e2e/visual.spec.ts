import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const SITE = 'http://127.0.0.1:3000';
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
  execFileSync('pnpm', ['db:seed'], { cwd: repoRoot, env, stdio: 'pipe' });
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      "UPDATE posts SET status = 'PUBLISHED', published_at = now(), updated_at = now() WHERE slug IN ('welcome-to-mernpress', 'about');",
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
});

test.afterAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) return;
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username = '${adminUsername}'); DELETE FROM users WHERE username = '${adminUsername}';`,
    ],
    { stdio: 'pipe' },
  );
});

async function settle(page: Page) {
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

test('public visual baselines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, route, heading] of [
    ['about', '/about', 'About'],
    ['404', '/public-visual-missing', 'Page not found'],
  ] as const) {
    await page.goto(`${SITE}${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`${name}-desktop.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
    });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const [name, route, heading] of [
    ['about', '/about', 'About'],
    ['404', '/public-visual-missing', 'Page not found'],
  ] as const) {
    await page.goto(`${SITE}${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`${name}-mobile.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
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
      maxDiffPixelRatio: 0.01,
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
      maxDiffPixelRatio: 0.01,
    });
  }
});
