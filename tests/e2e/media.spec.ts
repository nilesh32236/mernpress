import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const ADMIN_URL = 'http://127.0.0.1:5173/admin/';
const suffix = randomUUID().slice(0, 10);
const editorUsername = `e2e_media_${suffix}`;
const password = `E2E-${randomUUID()}-Aa1!`;

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for media browser tests');
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

/** Generate a real PNG in the page context and upload it through the hidden input. */
async function uploadPng(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#2271b1';
      ctx.fillRect(0, 0, 160, 90);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const buffer = Buffer.from(png, 'base64');
  await page.getByLabel('Upload media files').setInputFiles({
    name: `e2e-upload-${Date.now()}.png`,
    mimeType: 'image/png',
    buffer,
  });
}

test('editor can upload, browse, edit metadata and delete media', async ({ page }) => {
  await login(page);

  await page.goto(`${ADMIN_URL}media`);
  await expect(page.getByRole('heading', { name: /Media Library/ })).toBeVisible();
  // Fresh library: either the empty state or already-seeded items.
  const emptyState = page.getByText('No media yet');
  const hasEmpty = await emptyState.isVisible().catch(() => false);

  await uploadPng(page);
  await expect(page.getByRole('button', { name: /^View e2e-upload-/ })).toBeVisible({
    timeout: 15_000,
  });
  if (hasEmpty) {
    await expect(emptyState).toHaveCount(0);
  }

  // Detail drawer: edit alt text and save, then close the drawer.
  await page.getByRole('button', { name: /^View e2e-upload-/ }).click();
  await expect(page.getByLabel('Alt text')).toBeVisible();
  await page.getByLabel('Alt text').fill('E2E alt text');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Close media details').click();

  // Search finds the item; a nonsense search empties the grid.
  await page.getByLabel('Search media').fill('e2e-upload');
  await expect(page.getByRole('button', { name: /^View e2e-upload-/ })).toBeVisible();
  await page.getByLabel('Search media').fill('definitely-no-such-file');
  await expect(page.getByRole('button', { name: /^View e2e-upload-/ })).toHaveCount(0);

  // Delete with confirm.
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByLabel('Search media').fill('e2e-upload');
  await page.getByRole('button', { name: /^View e2e-upload-/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/160 × 90/)).toHaveCount(0, { timeout: 10_000 });
});
