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

async function login(page: Page, username: string) {
  await page.goto(ADMIN_URL);
  await page.getByLabel('Username or Email Address').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

async function openNewPost(page: Page) {
  await page.goto(`${ADMIN_URL}posts`);
  await page.goto(`${ADMIN_URL}posts/new`);
  await expect(page.getByRole('heading', { level: 1, name: 'New post' })).toBeVisible();
}

async function typeInBlockCanvas(page: Page, text: string) {
  const sheet = page.locator('.block-canvas-sheet');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const editable = sheet.locator('[contenteditable="true"]').first();
  await editable.click();
  await page.keyboard.type(text);
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
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'At a Glance' })).toBeVisible();

  await openNewPost(page);
  await page.getByLabel('Title', { exact: true }).fill(`E2E Acceptance Post ${suffix}`);
  await page.getByLabel('Slug').fill(createdPostSlug);
  await page.locator('summary', { hasText: 'SEO' }).click();
  await page.getByLabel('Excerpt').fill('Created by the Phase 4 browser workflow.');
  await typeInBlockCanvas(page, 'Hello from the Phase 5 block editor.');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();
  await expect(page.getByText('Content created.')).toBeVisible();
  await expect(page.locator('.block-canvas-sheet')).toContainText(
    'Hello from the Phase 5 block editor.',
  );

  createdPostId = new URL(page.url()).pathname.split('/')[3] ?? '';
  expect(createdPostId).toMatch(/^[0-9a-f-]{36}$/);

  // Content is persisted as canonical WordPress block markup, not plain text.
  const stored = await page.evaluate(async (postId) => {
    const response = await fetch(`/api/admin/posts/${postId}`, { credentials: 'include' });
    return (await response.json()) as { content: string };
  }, createdPostId);
  expect(stored.content).toContain('<!-- wp:paragraph');
  expect(stored.content).toContain('Hello from the Phase 5 block editor.');

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Content published.')).toBeVisible();
  await expect(page.locator('.editor-status-value')).toContainText('Published');

  const publicResponse = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/public/posts/${slug}?type=post`);
    return { status: response.status, body: await response.json() };
  }, createdPostSlug);
  expect(publicResponse.status).toBe(200);
  expect(publicResponse.body.title).toBe(`E2E Acceptance Post ${suffix}`);

  await page.goto(`${ADMIN_URL}posts`);
  await page.getByLabel('Search Posts').fill(`E2E Acceptance Post ${suffix}`);
  await page.getByRole('button', { name: 'Search Posts' }).click();
  await expect(page.getByRole('link', { name: `E2E Acceptance Post ${suffix}` })).toBeVisible();
  await page.getByRole('button', { name: /Published/ }).click();
  await expect(page.getByRole('link', { name: `E2E Acceptance Post ${suffix}` })).toBeVisible();

  await page.getByRole('link', { name: `E2E Acceptance Post ${suffix}` }).click();
  await page.getByLabel('Title', { exact: true }).fill(`E2E Acceptance Post edited ${suffix}`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.locator('.editor-options-menu summary').click();
  await page.getByRole('button', { name: 'Switch to draft' }).click();
  await expect(page.getByText('Content returned to draft.')).toBeVisible();
  await expect(page.locator('.editor-status-value')).toContainText('Draft');

  await page.locator('.editor-options-menu summary').click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .locator('.editor-options-panel')
    .getByRole('button', { name: 'Move to trash' })
    .click();
  await expect(page.getByText('Content moved to trash.')).toBeVisible();
  await expect(page.locator('.editor-status-value')).toContainText('Trashed');

  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Content restored.')).toBeVisible();
  await expect(page.locator('.editor-status-value')).toContainText('Draft');

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
  await secondPage.goto(`${ADMIN_URL}posts/${createdPostId}/edit`);
  await expect(secondPage.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();

  await page.goto(`${ADMIN_URL}posts/${createdPostId}/edit`);
  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(`E2E Conflict Winner ${suffix}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await secondPage.getByLabel('Title', { exact: true }).fill(`E2E Conflict Loser ${suffix}`);
  await secondPage.getByRole('button', { name: 'Save draft' }).click();
  await expect(
    secondPage.getByText('A newer version exists on the server. Reload it before editing again.'),
  ).toBeVisible();
  await expect(secondPage.getByRole('button', { name: 'Reload latest version' })).toBeVisible();

  secondPage.once('dialog', (dialog) => void dialog.accept());
  await secondPage.getByRole('button', { name: 'Reload latest version' }).click();
  await expect(secondPage.getByLabel('Title', { exact: true })).toHaveValue(
    `E2E Conflict Winner ${suffix}`,
  );
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
  await page.goto(`${ADMIN_URL}posts`);

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

  await page.getByLabel('Search Posts').fill(`Pagination ${suffix}`);
  await page.getByRole('button', { name: 'Search Posts' }).click();
  await expect(page.getByText('11 items').first()).toBeVisible();
  await expect(page.locator('.page-numbers.current')).toHaveText('Page 1 of 2');
  await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.page-numbers.current')).toHaveText('Page 2 of 2');
  await expect(page.getByText('11 items').first()).toBeVisible();
});

test('keyboard navigation, skip link and narrow viewport work', async ({ page }) => {
  test.setTimeout(60_000);
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

  await page.goto(`${ADMIN_URL}posts`);
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();

  await page.goto(`${ADMIN_URL}posts/new`);
  await expect(page.getByRole('heading', { level: 1, name: 'New post' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).focus();
  await page.keyboard.type(`Keyboard post ${suffix}`);
  await page.locator('.block-canvas-sheet [contenteditable="true"]').first().click();
  await page.keyboard.type('Keyboard content');
  await page.getByRole('button', { name: 'Save draft' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();
  await expect(page.getByText('Content created.')).toBeVisible();

  await page.goto(`${ADMIN_URL}posts`);
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);

  await page.getByLabel('Search Posts').focus();
  await page.keyboard.type('nonexistent-query');
  await page.keyboard.press('Enter');
  await expect(page.getByText('No matching content')).toBeVisible();
});

test('list controls and row actions match the WordPress chrome contract', async ({ page }) => {
  await login(page, editorUsername);
  await page.goto(`${ADMIN_URL}posts`);
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  const actions = row.locator('.row-actions');
  const edit = actions.getByRole('link', { name: 'Edit' }).first();

  // Off-screen rather than visibility:hidden, so Tab can reach it.
  expect(await actions.evaluate((el) => getComputedStyle(el).left)).not.toBe('0px');
  await edit.focus();
  await expect.poll(async () => actions.evaluate((el) => getComputedStyle(el).left)).toBe('0px');

  const metrics = await page.evaluate(() => {
    const input = document.querySelector('input[type=search]');
    const select = document.querySelector('.tablenav select, .bulk-select');
    return {
      inputBorder: input ? getComputedStyle(input).borderColor : null,
      inputRadius: input ? getComputedStyle(input).borderRadius : null,
      inputLineHeight: input ? getComputedStyle(input).lineHeight : null,
      selectLineHeight: select ? getComputedStyle(select).lineHeight : null,
      selectAppearance: select ? getComputedStyle(select).appearance : null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(metrics.inputBorder).toBe('rgb(148, 148, 148)');
  expect(metrics.inputRadius).toBe('2px');
  expect(metrics.inputLineHeight).toBe('normal');
  expect(metrics.selectLineHeight).toBe('30px');
  expect(metrics.selectAppearance).toBe('none');
  expect(metrics.scrollWidth).toBe(metrics.innerWidth);
});
