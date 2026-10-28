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
let createdPostId = '';
const createdPostSlug = `e2e-post-${suffix}`;

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for content browser tests');
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

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' });
}

async function login(page: Page, username: string) {
  await page.goto(ADMIN_URL);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

async function openNewPost(page: Page) {
  await primaryNav(page).getByRole('link', { name: 'Posts', exact: true }).click();
  await page.getByRole('link', { name: 'New post' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'New post' })).toBeVisible();
}

async function csrfFromBrowser(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const entry = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('mernpress_csrf='));
    return entry ? decodeURIComponent(entry.slice('mernpress_csrf='.length)) : '';
  });
  if (!token) throw new Error('CSRF cookie missing');
  return token;
}

test('editor can create, edit, publish, unpublish, trash and restore content', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await login(page, editorUsername);
  await expect(page.getByRole('heading', { name: 'Content overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Posts', exact: true })).toBeVisible();

  await openNewPost(page);
  await page.getByLabel('Title').fill(`E2E Acceptance Post ${suffix}`);
  await page.getByLabel('Slug').fill(createdPostSlug);
  await page.getByLabel('Excerpt').fill('Created by the Phase 4 browser workflow.');
  await page.getByLabel('Content').fill('Hello from the Phase 4 admin content form.');
  await page.getByRole('button', { name: 'Create draft' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();
  await expect(page.getByText('Content created.')).toBeVisible();
  createdPostId = new URL(page.url()).pathname.split('/')[2] ?? '';
  expect(createdPostId).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Content published.')).toBeVisible();
  await expect(page.locator('.status-badge')).toHaveText('Published');

  const publicResponse = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/public/posts/${slug}?type=post`);
    return { status: response.status, body: await response.json() };
  }, createdPostSlug);
  expect(publicResponse.status).toBe(200);
  expect(publicResponse.body.title).toBe(`E2E Acceptance Post ${suffix}`);

  await primaryNav(page).getByRole('link', { name: 'Posts', exact: true }).click();
  await page.getByLabel('Search posts').fill(`E2E Acceptance Post ${suffix}`);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: `E2E Acceptance Post ${suffix}` })).toBeVisible();
  await page.getByRole('tab', { name: /Published/ }).click();
  await expect(page.getByRole('link', { name: `E2E Acceptance Post ${suffix}` })).toBeVisible();

  await page.getByRole('link', { name: `E2E Acceptance Post ${suffix}` }).click();
  await page.getByLabel('Title').fill(`E2E Acceptance Post edited ${suffix}`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByText('Content returned to draft.')).toBeVisible();
  await expect(page.locator('.status-badge')).toHaveText('Draft');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Trash' }).click();
  await expect(page.getByText('Content moved to trash.')).toBeVisible();
  await expect(page.locator('.status-badge')).toHaveText('Trashed');

  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Content restored.')).toBeVisible();
  await expect(page.locator('.status-badge')).toHaveText('Draft');

  // The anonymous session probe is expected to return 401; it is not a UI error.
  const unexpectedErrors = consoleErrors.filter(
    (message) => !message.includes('401 (Unauthorized)'),
  );
  expect(unexpectedErrors).toEqual([]);
});

test('stale edits show a recoverable conflict instead of overwriting', async ({
  page,
  context,
}) => {
  expect(createdPostId).not.toBe('');
  await login(page, editorUsername);

  const secondPage = await context.newPage();
  await secondPage.goto(`${ADMIN_URL}/posts/${createdPostId}/edit`);
  await expect(secondPage.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();

  await page.goto(`${ADMIN_URL}/posts/${createdPostId}/edit`);
  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();
  await page.getByLabel('Title').fill(`E2E Conflict Winner ${suffix}`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await secondPage.getByLabel('Title').fill(`E2E Conflict Loser ${suffix}`);
  await secondPage.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    secondPage.getByText('A newer version exists on the server. Reload it before editing again.'),
  ).toBeVisible();
  await expect(secondPage.getByRole('button', { name: 'Reload latest version' })).toBeVisible();

  secondPage.once('dialog', (dialog) => void dialog.accept());
  await secondPage.getByRole('button', { name: 'Reload latest version' }).click();
  await expect(secondPage.getByLabel('Title')).toHaveValue(`E2E Conflict Winner ${suffix}`);
  await secondPage.close();
});

test('subscribers cannot see content navigation or content counts', async ({ page }) => {
  await login(page, subscriberUsername);
  await expect(page.getByText('No content access')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Posts', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Pages', exact: true })).toBeHidden();
});

test('list pagination uses server totals', async ({ page }) => {
  await login(page, editorUsername);
  await primaryNav(page).getByRole('link', { name: 'Posts', exact: true }).click();

  const csrf = await csrfFromBrowser(page);
  await page.evaluate(
    async ({ csrf: token, suffix: runSuffix }) => {
      for (let index = 0; index < 11; index += 1) {
        const response = await fetch('/api/admin/posts', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          body: JSON.stringify({ type: 'post', title: `Pagination ${runSuffix} ${index}` }),
        });
        if (response.status !== 201) throw new Error(`create failed: ${response.status}`);
      }
    },
    { csrf, suffix },
  );

  await page.getByLabel('Search posts').fill(`Pagination ${suffix}`);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(/Page 1 of 2 · 11 total/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(/Page 2 of 2 · 11 total/)).toBeVisible();
});

test('keyboard navigation, skip link and narrow viewport work', async ({ page }) => {
  await login(page, editorUsername);
  await page.goto(ADMIN_URL);
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

  const firstFocusable = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    return nodes[0]?.className ?? '';
  });
  expect(firstFocusable).toContain('skip-link');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await primaryNav(page).getByRole('link', { name: 'Posts', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();

  await page.getByRole('link', { name: 'New post' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'New post' })).toBeVisible();
  await page.getByLabel('Title').focus();
  await page.keyboard.type(`Keyboard post ${suffix}`);
  await page.keyboard.press('Tab');
  await page.keyboard.type(`keyboard-post-${suffix}`);
  await page.keyboard.press('Tab');
  await page.keyboard.type('Keyboard excerpt');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Keyboard content');
  await page.getByRole('button', { name: 'Create draft' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();
  await expect(page.getByText('Content created.')).toBeVisible();

  await primaryNav(page).getByRole('link', { name: 'Posts', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);

  await page.getByLabel('Search posts').focus();
  await page.keyboard.type('nonexistent-query');
  await page.keyboard.press('Enter');
  await expect(page.getByText('No matching content')).toBeVisible();
});
