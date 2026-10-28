import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const ADMIN_URL = 'http://127.0.0.1:5173';
const suffix = randomUUID().slice(0, 10);
const editorUsername = `e2e_ed_${suffix}`;
const subscriberUsername = `e2e_sub_${suffix}`;
const password = `E2E-${randomUUID()}-Aa1!`;
const termName = `E2E Category ${suffix}`;
const renamedTermName = `E2E Category Renamed ${suffix}`;

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for terms browser tests');
  }

  const env = {
    ...process.env,
    TEST_DATABASE_URL: testDatabaseUrl,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: 'test',
    MERNPRESS_TEST_ACCOUNT_PASSWORD: password,
  };

  for (const [role, username] of [
    ['editor', editorUsername],
    ['subscriber', subscriberUsername],
  ] as const) {
    execFileSync(
      'pnpm',
      [
        'dev:create-test-account',
        '--i-understand-dev-only',
        '--role',
        role,
        '--username',
        username,
      ],
      { cwd: repoRoot, env, stdio: 'pipe' },
    );
  }
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

async function login(page: Page, username: string) {
  await page.goto(ADMIN_URL);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

test('editor can create, rename and delete a category', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());

  await login(page, editorUsername);
  await page.getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { name: 'Categories & Tags' })).toBeVisible();

  await page.getByLabel('New category name').fill(termName);
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByText('Category created.')).toBeVisible();
  await expect(page.getByText(termName)).toBeVisible();

  await page.getByRole('button', { name: 'Rename' }).first().click();
  const row = page.locator('tr', { hasText: termName });
  await row.getByRole('textbox').fill(renamedTermName);
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Term renamed.')).toBeVisible();
  await expect(page.getByText(renamedTermName)).toBeVisible();

  const deleteRow = page.locator('tr', { hasText: renamedTermName });
  await deleteRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/post\(s\) detached/i)).toBeVisible();
});

test('non-editor gets no-access on terms', async ({ page }) => {
  await login(page, subscriberUsername);
  await page.goto(`${ADMIN_URL}/terms`);
  await expect(page.getByText('No term management access')).toBeVisible();
});
