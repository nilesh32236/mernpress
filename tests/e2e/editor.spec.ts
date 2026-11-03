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
const editorUsername = `e2e_block_${suffix}`;
const password = `E2E-${randomUUID()}-Aa1!`;
let postId = '';
let postSlug = '';

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for editor browser tests');
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

async function openNewPost(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 900) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.goto(`${ADMIN_URL}posts/new`);
  await expect(page.getByRole('heading', { level: 1, name: 'New post' })).toBeVisible();
  await expect(page.locator('.block-canvas-sheet')).toBeVisible({ timeout: 20_000 });
}

async function insertBlock(page: Page, searchTerm: string, optionName: RegExp) {
  await page.getByRole('button', { name: 'Add block' }).click();
  const search = page.getByRole('searchbox').or(page.getByPlaceholder('Search')).first();
  await search.fill(searchTerm);
  const option = page.getByRole('option', { name: optionName }).first();
  await expect(option).toBeVisible();
  await option.click();
}

async function storedContent(page: Page, id: string): Promise<string> {
  return page.evaluate(async (postId) => {
    const response = await fetch(`/api/admin/posts/${postId}`, { credentials: 'include' });
    const body = (await response.json()) as { content: string };
    return body.content;
  }, id);
}

test('creates content with paragraph, heading and list blocks and reloads it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await login(page);
  await openNewPost(page);

  await page.getByLabel('Title', { exact: true }).fill(`Block editor post ${suffix}`);
  await page.locator('.block-canvas-sheet [contenteditable="true"]').first().click();
  await page.keyboard.type('Opening paragraph from the block editor.');

  await insertBlock(page, 'heading', /^Heading/);
  await page.keyboard.type('A section heading');

  await insertBlock(page, 'list', /^List$/);
  await page.keyboard.type('First list item');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second list item');

  const sheet = page.locator('.block-canvas-sheet');
  await expect(sheet).toContainText('Opening paragraph from the block editor.');
  await expect(sheet).toContainText('A section heading');
  await expect(sheet).toContainText('First list item');
  await expect(sheet).toContainText('Second list item');

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Content created.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();

  postId = new URL(page.url()).pathname.split('/')[3] ?? '';
  expect(postId).toMatch(/^[0-9a-f-]{36}$/);

  const content = await storedContent(page, postId);
  expect(content).toContain('<!-- wp:paragraph');
  expect(content).toContain('<!-- wp:heading');
  expect(content).toContain('<!-- wp:list');
  expect(content).toContain('<!-- wp:list-item');
  expect(content).toContain('Opening paragraph from the block editor.');
  expect(content).toContain('Second list item');

  await page.reload();
  await expect(page.locator('.block-canvas-sheet')).toContainText(
    'Opening paragraph from the block editor.',
  );
  await expect(page.locator('.block-canvas-sheet')).toContainText('Second list item');
  await expect(page.locator('.block-canvas-sheet h2')).toHaveText('A section heading');

  // The admin still keeps no auth or token state in browser storage, even
  // after loading the WordPress packages.
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(storage).toEqual({ local: [], session: [] });

  expect(errors).toEqual([]);
});

test('publishes from the editor and exposes the post publicly', async ({ page }) => {
  expect(postId).not.toBe('');
  await login(page);
  await page.goto(`${ADMIN_URL}posts/${postId}/edit`);
  await expect(page.getByRole('heading', { level: 1, name: 'Edit post' })).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Content published.')).toBeVisible();
  await expect(page.locator('.editor-status-value')).toContainText('Published');

  postSlug = await page.evaluate(async (id) => {
    const response = await fetch(`/api/admin/posts/${id}`, { credentials: 'include' });
    return ((await response.json()) as { slug: string }).slug;
  }, postId);

  const publicPost = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/public/posts/${slug}?type=post`);
    return { status: response.status, body: (await response.json()) as { title: string } };
  }, postSlug);

  expect(publicPost.status).toBe(200);
  expect(publicPost.body.title).toBe(`Block editor post ${suffix}`);

  // The published document still contains the blocks authored in the canvas.
  const content = await storedContent(page, postId);
  expect(content).toContain('<!-- wp:list-item');
});

test('undo and redo restore structural changes without losing typed text', async ({ page }) => {
  await login(page);
  await openNewPost(page);
  await page.getByLabel('Title', { exact: true }).fill(`Undo post ${suffix}`);
  await page.locator('.block-canvas-sheet [contenteditable="true"]').first().click();
  await page.keyboard.type('Keep this paragraph.');

  await insertBlock(page, 'separator', /^Separator/);
  await expect(page.locator('.block-canvas-sheet .wp-block-separator')).toHaveCount(1);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.block-canvas-sheet .wp-block-separator')).toHaveCount(0);
  await expect(page.locator('.block-canvas-sheet')).toContainText('Keep this paragraph.');

  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.block-canvas-sheet .wp-block-separator')).toHaveCount(1);

  // Persist the restored state with the keyboard shortcut, then verify it
  // server-side.
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Content created.')).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[3] ?? '';
  const content = await storedContent(page, id);
  expect(content).toContain('Keep this paragraph.');
  expect(content).toContain('<!-- wp:separator');
});

test('inserts a quote and shows real block settings in the inspector', async ({ page }) => {
  await login(page);
  await openNewPost(page);
  await page.getByLabel('Title', { exact: true }).fill(`Quote post ${suffix}`);

  await insertBlock(page, 'quote', /^Quote/);
  await page.keyboard.type('A line worth quoting.');

  // The inspector must show the selected block's settings, not the empty hint.
  await page.getByRole('tab', { name: 'Block' }).click();
  await page.getByRole('button', { name: 'Open block settings' }).click();
  const inspector = page.locator('.block-canvas-inspector');
  // Typing focuses the quote's inner paragraph, so the inspector shows that
  // block's real settings rather than the empty-selection hint.
  await expect(inspector).toContainText('Typography');
  await expect(inspector).not.toContainText('Select a block to edit its settings');
  await page.getByRole('button', { name: 'Close block settings' }).click();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Content created.')).toBeVisible();

  const id = new URL(page.url()).pathname.split('/')[3] ?? '';
  const content = await storedContent(page, id);
  expect(content).toContain('<!-- wp:quote');
  expect(content).toContain('A line worth quoting.');
});

test('inserts an image from a URL and persists canonical image markup', async ({ page }) => {
  await login(page);
  await openNewPost(page);
  await page.getByLabel('Title', { exact: true }).fill(`Image post ${suffix}`);

  await insertBlock(page, 'image', /^Image/);
  await page.getByText('Insert from URL').click();
  const url = page.getByPlaceholder('Paste or type URL');
  await url.fill('https://images.example.com/photo.jpg');
  await url.press('Enter');

  await expect(page.locator('.block-canvas-sheet img')).toHaveAttribute(
    'src',
    'https://images.example.com/photo.jpg',
  );
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Content created.')).toBeVisible();

  const id = new URL(page.url()).pathname.split('/')[3] ?? '';
  const content = await storedContent(page, id);
  expect(content).toContain('<!-- wp:image');
  expect(content).toContain('src="https://images.example.com/photo.jpg"');
});

test('unknown blocks are preserved byte-for-byte through load and save', async ({ page }) => {
  await login(page);
  const unknownContent =
    '<!-- wp:acme/widget {"count":3} --><div class="acme">Custom widget</div><!-- /wp:acme/widget -->\n\n<!-- wp:paragraph --><p>Known paragraph</p><!-- /wp:paragraph -->';

  const created = await page.evaluate(async (content) => {
    const csrf = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('mernpress_csrf='));
    const token = csrf ? decodeURIComponent(csrf.slice('mernpress_csrf='.length)) : '';
    const response = await fetch('/api/admin/posts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ type: 'post', title: 'Unknown block post', content }),
    });
    return (await response.json()) as { id: string; content: string };
  }, unknownContent);

  await page.goto(`${ADMIN_URL}posts/${created.id}/edit`);
  await expect(page.locator('.block-canvas-sheet')).toContainText('Custom widget');
  await expect(page.locator('.block-canvas-sheet')).toContainText('Known paragraph');
  await expect(page.locator('.block-canvas-sheet')).toContainText(/doesn’t include support/);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  expect(await storedContent(page, created.id)).toBe(unknownContent);
});

test('the editor stays usable at 375px with an off-canvas settings panel', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await openNewPost(page);

  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  await expect(page.locator('.block-canvas-sheet')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Add block' })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);

  await expect(page.getByRole('complementary', { name: 'Document settings' })).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Document settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Close settings panel' }).click();
  await expect(page.getByRole('complementary', { name: 'Document settings' })).toBeHidden();
});
