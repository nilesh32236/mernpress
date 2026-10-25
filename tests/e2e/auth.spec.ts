import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const ADMIN_URL = 'http://127.0.0.1:5173';
const username = `e2e_${Date.now()}`;
const password = `E2E-${randomUUID()}-Aa1!`;

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for the auth browser test');
  }

  const env = {
    ...process.env,
    TEST_DATABASE_URL: testDatabaseUrl,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: 'test',
  };

  execFileSync('pnpm', ['db:reset:test'], { cwd: repoRoot, env, stdio: 'pipe' });
  execFileSync(
    'pnpm',
    ['--filter', '@mernpress/api', 'auth:bootstrap', '--', '--username', username],
    {
      cwd: repoRoot,
      env: { ...env, MERNPRESS_ADMIN_PASSWORD: password },
      stdio: 'pipe',
    },
  );
});

test('signs in with the login form and signs out without browser token storage', async ({
  page,
}) => {
  await page.goto(ADMIN_URL);

  await expect(page.getByRole('heading', { level: 1, name: 'MERNPress admin' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText(username)).toBeVisible();

  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(storage).toEqual({ local: [], session: [] });

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Username')).toBeVisible();
});

test('shows a generic error for an invalid password', async ({ page }) => {
  await page.goto(ADMIN_URL);

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('definitely the wrong password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toContainText('Invalid username or password.');
  await expect(page.getByLabel('Username')).toBeVisible();
});

test('supports keyboard-only sign-in', async ({ page }) => {
  await page.goto(ADMIN_URL);

  await page.getByLabel('Username').focus();
  await page.keyboard.type(username);
  await page.keyboard.press('Tab');
  await page.keyboard.type(password);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
