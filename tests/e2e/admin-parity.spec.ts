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
const adminUsername = `e2e_admin_${suffix}`;
const password = `E2E-${randomUUID()}-Aa1!`;
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const authPepper =
  process.env['AUTH_HASH_PEPPER'] ?? 'e2e-test-auth-hash-pepper-2026-10-25-0123456789';

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for the admin parity browser test');
}

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
  const env = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    AUTH_HASH_PEPPER: authPepper,
    NODE_ENV: 'test',
    MERNPRESS_ADMIN_PASSWORD: password,
  };
  // A previous aborted run may have left an administrator with an unknown
  // password; the test database is disposable, so start from a clean admin set.
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
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      `DELETE FROM jobs;
       INSERT INTO jobs (id, type, payload, status, priority, attempts, max_attempts, scheduled_at, completed_at, created_at, updated_at)
       VALUES
         (gen_random_uuid(), 'analytics.retention', '{}', 'COMPLETED', 0, 1, 3, now() - interval '5 minutes', now() - interval '5 minutes', now(), now()),
         (gen_random_uuid(), 'notes.retention', '{}', 'PENDING', 0, 0, 3, now() + interval '1 hour', NULL, now(), now());`,
    ],
    { stdio: 'pipe' },
  );
});

test.afterAll(() => {
  execFileSync(
    'psql',
    [
      testDatabaseUrl,
      '-c',
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username = '${adminUsername}');
       DELETE FROM users WHERE username = '${adminUsername}';
       DELETE FROM jobs WHERE type IN ('analytics.retention', 'notes.retention');`,
    ],
    { stdio: 'pipe' },
  );
});

async function login(page: Page) {
  await page.goto(ADMIN_URL);
  await page.getByLabel('Username or Email Address').fill(adminUsername);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

async function h1AndOverflow(page: Page) {
  return page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const style = h1 ? getComputedStyle(h1) : null;
    return {
      h1: h1?.textContent?.trim() ?? null,
      font: style?.fontSize ?? null,
      weight: style?.fontWeight ?? null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
}

test('remaining admin screens keep the measured WordPress chrome contract', async ({
  page,
}, testInfo) => {
  await login(page);

  const screens: Array<[string, string]> = [
    ['/admin/posts', 'Posts'],
    ['/admin/pages', 'Pages'],
    ['/admin/users', 'Users'],
    ['/admin/plugins', 'Plugins'],
    ['/admin/settings', 'General Settings'],
    ['/admin/tools', 'Tools'],
    ['/admin/tools/backups', 'Backups'],
    ['/admin/analytics', 'Analytics'],
    ['/admin/tools/jobs', 'Scheduled Actions'],
  ];

  for (const [route, heading] of screens) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    const metrics = await h1AndOverflow(page);
    expect(metrics.h1).toBe(heading);
    expect(metrics.font).toBe('23px');
    expect(metrics.weight).toBe('400');
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  }

  // Settings → General: WP 7.1 text inputs are 40px, #949494, 2px radius.
  await page.goto('http://127.0.0.1:5173/admin/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'General Settings' })).toBeVisible();
  await expect(page.locator('#site_title')).toBeVisible();
  const settings = await page.evaluate(() => {
    const input = document.querySelector(
      '.settings-panel .field input:not([type]), .settings-panel .field input[type=text]',
    );
    if (!input) return null;
    const style = getComputedStyle(input);
    return {
      height: Math.round(input.getBoundingClientRect().height),
      radius: style.borderRadius,
      border: style.borderColor,
      fontSize: style.fontSize,
    };
  });
  expect(settings).toEqual({
    height: 40,
    radius: '2px',
    border: 'rgb(148, 148, 148)',
    fontSize: '14px',
  });

  // Plugins rows use the WordPress 10px 9px cell padding, not the generic 8/10.
  await page.goto('http://127.0.0.1:5173/admin/plugins');
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
  await expect(page.getByText('Auto Excerpt')).toBeVisible();
  const pluginPadding = await page.evaluate(() => {
    const cell = document.querySelector('.plugins-screen .content-table.plugins tbody td');
    return cell ? getComputedStyle(cell).padding : null;
  });
  expect(pluginPadding).toBe('10px 9px');

  // Scheduled Actions: native-looking search was a regression; actions are
  // visible (not the hover-only row-action pattern) because this is a column.
  await page.goto('http://127.0.0.1:5173/admin/tools/jobs');
  await expect(page.getByRole('heading', { level: 1, name: 'Scheduled Actions' })).toBeVisible();
  await expect(page.getByText('analytics.retention')).toBeVisible();
  const jobsDesktop = await page.evaluate(() => {
    const search = document.querySelector('.jobs-toolbar input[type=search]');
    const actions = document.querySelector('.job-actions');
    const rows = document.querySelectorAll('.jobs-table tbody tr');
    const searchStyle = search ? getComputedStyle(search) : null;
    const actionsStyle = actions ? getComputedStyle(actions) : null;
    return {
      search: search
        ? {
            height: Math.round(search.getBoundingClientRect().height),
            radius: searchStyle?.borderRadius ?? null,
            border: searchStyle?.borderColor ?? null,
            fontSize: searchStyle?.fontSize ?? null,
            padding: searchStyle?.padding ?? null,
          }
        : null,
      actions: actionsStyle
        ? {
            position: actionsStyle.position,
            left: actionsStyle.left,
            buttons: document.querySelectorAll('.job-actions button').length,
          }
        : null,
      rows: rows.length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(jobsDesktop.search).toEqual({
    height: 32,
    radius: '2px',
    border: 'rgb(148, 148, 148)',
    fontSize: '14px',
    padding: '0px 12px',
  });
  expect(jobsDesktop.actions).toMatchObject({ position: 'static', buttons: 3 });
  expect(jobsDesktop.actions?.left).not.toContain('-129987');
  expect(jobsDesktop.rows).toBe(2);
  expect(jobsDesktop.scrollWidth).toBeLessThanOrEqual(jobsDesktop.innerWidth);
  await testInfo.attach('scheduled-actions-desktop', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  // Mobile: the generic list table hides every column without a title class,
  // which used to leave blank rows; keep hook/status/actions and the filter.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('http://127.0.0.1:5173/admin/tools/jobs');
  await expect(page.getByRole('heading', { level: 1, name: 'Scheduled Actions' })).toBeVisible();
  await expect(page.getByText('analytics.retention')).toBeVisible();
  const jobsMobile = await page.evaluate(() => {
    const row = document.querySelector('.jobs-table tbody tr');
    const cells = [...(row?.querySelectorAll('th, td') ?? [])];
    const visible = cells.filter((cell) => getComputedStyle(cell).display !== 'none');
    const toolbar = document.querySelector('.jobs-toolbar');
    const actions = document.querySelector('.job-actions');
    return {
      visibleCells: visible.length,
      totalCells: cells.length,
      visibleClasses: visible.map((cell) => cell.className),
      toolbarDisplay: toolbar ? getComputedStyle(toolbar).display : null,
      actionsVisible: actions ? actions.getBoundingClientRect().width > 0 : false,
      rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(jobsMobile.visibleCells).toBe(3);
  expect(jobsMobile.totalCells).toBe(6);
  expect(jobsMobile.visibleClasses).toEqual(['column-hook', 'column-status', 'column-actions']);
  expect(jobsMobile.toolbarDisplay).toBe('flex');
  expect(jobsMobile.actionsVisible).toBe(true);
  expect(jobsMobile.rowHeight).toBeGreaterThan(30);
  expect(jobsMobile.scrollWidth).toBeLessThanOrEqual(jobsMobile.innerWidth);
  await testInfo.attach('scheduled-actions-mobile', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
