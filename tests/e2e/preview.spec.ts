import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const ADMIN_URL = 'http://127.0.0.1:5173/admin/';
const API_URL = process.env['E2E_API_URL'] ?? 'http://127.0.0.1:4100';
const suffix = randomUUID().slice(0, 10);
const editorUsername = `e2e_prev_${suffix}`;
const password = `E2E-${randomUUID()}-Aa1!`;

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for preview browser tests');
  }
  execFileSync(
    'pnpm',
    [
      'dev:create-test-account',
      '--i-understand-dev-only',
      '--role',
      'editor',
      '--username',
      editorUsername,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        TEST_DATABASE_URL: testDatabaseUrl,
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: 'test',
        MERNPRESS_TEST_ACCOUNT_PASSWORD: password,
      },
      stdio: 'pipe',
    },
  );
});

test.afterAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) return;
  execFileSync('pnpm', ['db:reset:test'], {
    cwd: repoRoot,
    env: { ...process.env, TEST_DATABASE_URL: testDatabaseUrl, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
});

async function login(page: Page) {
  await page.goto(ADMIN_URL);
  await page.getByLabel('Username or Email Address').fill(editorUsername);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

test('editor Preview rotates a token and the token-gated API preview serves the draft', async ({
  page,
  request,
}) => {
  await login(page);

  // Create a draft through the admin UI (creation lands on the edit route).
  await page.goto(`${ADMIN_URL}posts/new`);
  const title = `E2E Preview Post ${suffix}`;
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Content created.')).toBeVisible({ timeout: 15_000 });
  await page.waitForURL(/\/posts\/[0-9a-f-]+\/edit/, { timeout: 15_000 });

  // The Preview button rotates a token on first use and opens the web preview.
  const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const popup = await popupPromise;
  const previewUrl = popup.url();
  expect(previewUrl).toContain('/preview/');
  const token = previewUrl.split('/preview/')[1] ?? '';
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  // The token-gated API preview serves the draft through the sanitized renderer.
  const response = await request.get(`${API_URL}/api/public/preview/${token}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  const body = await response.json();
  expect(body.title).toBe(title);
  expect(body).toHaveProperty('renderedContent');

  // Wrong tokens are the same 404 shape as unknown slugs (no existence leak).
  const wrong = await request.get(`${API_URL}/api/public/preview/${'0'.repeat(64)}`);
  expect(wrong.status()).toBe(404);
});
