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
       DELETE FROM media_folders;
       WITH root AS (
         INSERT INTO media_folders (id, name, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Audit Root', now(), now())
         RETURNING id
       )
       INSERT INTO media_folders (id, name, parent_id, created_at, updated_at)
       SELECT gen_random_uuid(), 'Audit Child', id, now(), now() FROM root;
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
       DELETE FROM jobs WHERE type IN ('analytics.retention', 'notes.retention', 'media.regenerate');
       DELETE FROM media_folders WHERE name IN ('Audit Root', 'Audit Child');`,
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
  // The group fetch can briefly replace the form with a skeleton after the
  // first render; poll until the real input is stable.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const input = document.getElementById('site_title');
          if (!input) return null;
          const style = getComputedStyle(input);
          return {
            height: Math.round(input.getBoundingClientRect().height),
            radius: style.borderRadius,
            border: style.borderColor,
            fontSize: style.fontSize,
          };
        }),
      { timeout: 8000 },
    )
    .toEqual({
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

test('Analytics, Languages, Backups and the Media folder manager keep the control and responsive contracts', async ({
  page,
}, testInfo) => {
  await login(page);

  const screens: Array<[string, string, () => Promise<void>]> = [
    [
      'analytics',
      '/admin/analytics',
      async () => {
        await expect(page.getByRole('heading', { name: 'Views per day' })).toBeVisible();
      },
    ],
    [
      'languages',
      '/admin/settings/languages',
      async () => {
        await expect(page.getByRole('heading', { name: 'Theme strings' })).toBeVisible();
      },
    ],
    [
      'backups',
      '/admin/tools/backups',
      async () => {
        await expect(page.getByRole('heading', { name: /Stored backups/ })).toBeVisible();
      },
    ],
    [
      'media',
      '/admin/media',
      async () => {
        await expect(page.locator('.folder-manager summary')).toBeVisible();
      },
    ],
  ];

  for (const [name, route, waitFor] of screens) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await waitFor();
    const metrics = await h1AndOverflow(page);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    await testInfo.attach(`${name}-desktop`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }

  await page.goto('http://127.0.0.1:5173/admin/analytics');
  await expect(page.getByRole('heading', { name: 'Views per day' })).toBeVisible();
  const analytics = await page.evaluate(() => {
    const select = document.querySelector('.analytics-range select');
    if (!select) return null;
    const style = getComputedStyle(select);
    const privacy = document.querySelector('.analytics-privacy');
    return {
      select: {
        height: Math.round(select.getBoundingClientRect().height),
        font: style.fontSize,
        radius: style.borderRadius,
        border: style.borderColor,
        padding: style.padding,
      },
      privacyWidth: privacy ? Math.round(privacy.getBoundingClientRect().width) : null,
    };
  });
  expect(analytics?.select).toEqual({
    height: 32,
    font: '14px',
    radius: '2px',
    border: 'rgb(148, 148, 148)',
    padding: '0px 24px 0px 8px',
  });
  expect(analytics?.privacyWidth).toBeLessThanOrEqual(820);

  await page.goto('http://127.0.0.1:5173/admin/settings/languages');
  await expect(page.getByRole('heading', { name: 'Theme strings' })).toBeVisible();
  const languages = await page.evaluate(() => {
    const h2 = [...document.querySelectorAll('.settings-panel > h2')].find(
      (element) => element.textContent?.trim() === 'Theme strings',
    );
    const input = document.querySelector('#theme-strings-filter');
    return {
      heading: h2
        ? {
            font: getComputedStyle(h2).fontSize,
            margin: getComputedStyle(h2).margin,
            weight: getComputedStyle(h2).fontWeight,
          }
        : null,
      input: input
        ? {
            height: Math.round(input.getBoundingClientRect().height),
            radius: getComputedStyle(input).borderRadius,
            border: getComputedStyle(input).borderColor,
          }
        : null,
    };
  });
  expect(languages.heading).toEqual({ font: '16.9px', margin: '16.9px 0px', weight: '600' });
  expect(languages.input).toEqual({ height: 40, radius: '2px', border: 'rgb(148, 148, 148)' });

  await page.goto('http://127.0.0.1:5173/admin/tools/backups');
  await expect(page.getByRole('heading', { name: /Stored backups/ })).toBeVisible();
  const backups = await page.evaluate(() => {
    const h2 = [...document.querySelectorAll('.settings-panel > h2')].find(
      (element) => element.textContent?.trim() === 'Create a backup',
    );
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === 'Create backup',
    );
    return {
      heading: h2
        ? { font: getComputedStyle(h2).fontSize, margin: getComputedStyle(h2).margin }
        : null,
      button: button
        ? {
            height: Math.round(button.getBoundingClientRect().height),
            padding: getComputedStyle(button).padding,
            radius: getComputedStyle(button).borderRadius,
          }
        : null,
    };
  });
  expect(backups.heading).toEqual({ font: '16.9px', margin: '16.9px 0px' });
  expect(backups.button).toEqual({ height: 32, padding: '0px 10px', radius: '2px' });

  await page.goto('http://127.0.0.1:5173/admin/media');
  await expect(page.locator('.folder-manager summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Audit Root' })).toBeVisible();
  const media = await page.evaluate(() => {
    const select = document.querySelector('.media-folder-bar select');
    const input = document.querySelector('.media-folder-inline input');
    const rows = document.querySelectorAll('.folder-tree-item');
    const actions = document.querySelector('.folder-tree-actions');
    const style = (element: Element | null) => (element ? getComputedStyle(element) : null);
    const selectStyle = style(select);
    const inputStyle = style(input);
    return {
      select: select
        ? {
            height: Math.round(select.getBoundingClientRect().height),
            font: selectStyle?.fontSize ?? null,
            radius: selectStyle?.borderRadius ?? null,
            border: selectStyle?.borderColor ?? null,
          }
        : null,
      input: input
        ? {
            height: Math.round(input.getBoundingClientRect().height),
            radius: inputStyle?.borderRadius ?? null,
            border: inputStyle?.borderColor ?? null,
            padding: inputStyle?.padding ?? null,
          }
        : null,
      folderRows: rows.length,
      actionsWrap: actions ? (style(actions)?.flexWrap ?? null) : null,
      toolbarWrap: document.querySelector('.media-folder-bar')
        ? getComputedStyle(document.querySelector('.media-folder-bar')!).flexWrap
        : null,
    };
  });
  expect(media.select).toEqual({
    height: 32,
    font: '14px',
    radius: '2px',
    border: 'rgb(148, 148, 148)',
  });
  expect(media.input).toEqual({
    height: 32,
    radius: '2px',
    border: 'rgb(148, 148, 148)',
    padding: '0px 12px',
  });
  expect(media.folderRows).toBeGreaterThanOrEqual(3);
  expect(media.actionsWrap).toBe('wrap');
  expect(media.toolbarWrap).toBe('wrap');

  // Mobile pass for the same four screens: no horizontal overflow, and the
  // media folder controls stay on the 32px touch target.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [name, route, waitFor] of screens) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await waitFor();
    const metrics = await h1AndOverflow(page);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    await testInfo.attach(`${name}-mobile`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }

  await page.goto('http://127.0.0.1:5173/admin/media');
  await expect(page.locator('.folder-manager summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Audit Root' })).toBeVisible();
  const mediaMobile = await page.evaluate(() => {
    const select = document.querySelector('.media-folder-bar select');
    const input = document.querySelector('.media-folder-inline input');
    const actions = document.querySelector('.folder-tree-actions');
    return {
      select: select ? Math.round(select.getBoundingClientRect().height) : null,
      input: input ? Math.round(input.getBoundingClientRect().height) : null,
      actionsWrap: actions ? getComputedStyle(actions).flexWrap : null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(mediaMobile.select).toBe(32);
  expect(mediaMobile.input).toBe(32);
  expect(mediaMobile.actionsWrap).toBe('wrap');
  expect(mediaMobile.scrollWidth).toBeLessThanOrEqual(mediaMobile.innerWidth);
});

test('remaining custom screens keep the WordPress control and responsive contracts', async ({
  page,
}, testInfo) => {
  await login(page);

  const screens: Array<{
    name: string;
    route: string;
    heading: string;
    wait: () => Promise<void>;
    mobileShot?: boolean;
  }> = [
    {
      name: 'consent',
      route: '/admin/settings/consent',
      heading: 'Consent',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'connectors',
      route: '/admin/settings/connectors',
      heading: 'Connectors',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Spam protection' })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'redirects',
      route: '/admin/tools/redirects',
      heading: 'Redirects',
      wait: async () => {
        await expect(page.getByRole('heading', { name: /Redirects \(/ })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'export-personal-data',
      route: '/admin/tools/export-personal-data',
      heading: 'Export Personal Data',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Add Data Export Request' })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'erase-personal-data',
      route: '/admin/tools/erase-personal-data',
      heading: 'Erase Personal Data',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Add Data Erasure Request' })).toBeVisible();
      },
    },
    {
      name: 'import',
      route: '/admin/tools/import',
      heading: 'Import',
      wait: async () => {
        await expect(page.getByText('Blogger', { exact: true })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'export',
      route: '/admin/tools?section=export',
      heading: 'Export',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Choose what to export' })).toBeVisible();
      },
    },
    {
      name: 'profile',
      route: '/admin/profile',
      heading: 'Profile',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Personal Options' })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'terms',
      route: '/admin/terms?taxonomy=category',
      heading: 'Categories',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Add Category' })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'customize',
      route: '/admin/themes/customize',
      heading: 'Customizing: MERNPress',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Customizing: MERNPress' })).toBeVisible();
      },
      mobileShot: true,
    },
    {
      name: 'site-editor',
      route: '/admin/site-editor',
      heading: 'Design',
      wait: async () => {
        await expect(page.getByRole('heading', { name: 'Design' })).toBeVisible();
      },
      mobileShot: true,
    },
  ];

  for (const screen of screens) {
    await page.goto(`http://127.0.0.1:5173${screen.route}`);
    await screen.wait();
    const metrics = await h1AndOverflow(page);
    expect(metrics.h1).toBe(screen.heading);
    expect(metrics.scrollWidth, `${screen.name} desktop overflow`).toBeLessThanOrEqual(
      metrics.innerWidth,
    );
    await testInfo.attach(`${screen.name}-desktop`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  }

  // Redirects: the status select must stay inside the 1440 viewport.
  await page.goto('http://127.0.0.1:5173/admin/tools/redirects');
  await expect(page.getByRole('heading', { name: /Redirects \(/ })).toBeVisible();
  const redirects = await page.evaluate(() => {
    const form = document.querySelector('.redirect-form');
    const status = document.querySelector('#redirect-status');
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      formWidth: form ? Math.round(form.getBoundingClientRect().width) : null,
      statusRight: status ? Math.round(status.getBoundingClientRect().right) : null,
      statusWidth: status ? Math.round(status.getBoundingClientRect().width) : null,
    };
  });
  expect(redirects.scrollWidth).toBeLessThanOrEqual(redirects.innerWidth);
  expect(redirects.statusWidth).toBe(180);
  expect(redirects.statusRight).toBeLessThanOrEqual(redirects.innerWidth);
  expect(redirects.formWidth).toBeGreaterThan(1000);

  // Connectors: aligned 760px stack and WordPress 40px inputs.
  await page.goto('http://127.0.0.1:5173/admin/settings/connectors');
  await expect(page.getByRole('heading', { name: 'Spam protection' })).toBeVisible();
  await expect(page.getByText('OpenAI', { exact: true })).toBeVisible();
  const connectors = await page.evaluate(() => {
    const areas = ['.spam-guard-card', '.connectors-banner', '.connectors-list'].map((selector) => {
      const element = document.querySelector(selector);
      return element
        ? {
            x: Math.round(element.getBoundingClientRect().left),
            width: Math.round(element.getBoundingClientRect().width),
          }
        : null;
    });
    const inputs = [
      ...document.querySelectorAll('.spam-guard-thresholds input, .connector-connect input'),
    ]
      .slice(0, 4)
      .map((element) => ({
        height: Math.round(element.getBoundingClientRect().height),
        font: getComputedStyle(element).fontSize,
        radius: getComputedStyle(element).borderRadius,
        border: getComputedStyle(element).borderColor,
      }));
    return { areas, inputs };
  });
  expect(connectors.areas).toEqual([
    { x: 182, width: 760 },
    { x: 182, width: 760 },
    { x: 182, width: 760 },
  ]);
  for (const input of connectors.inputs) {
    expect(input).toEqual({
      height: 40,
      font: '14px',
      radius: '2px',
      border: 'rgb(148, 148, 148)',
    });
  }

  // Export filters: WordPress 40px selects/inputs.
  await page.goto('http://127.0.0.1:5173/admin/tools?section=export');
  await expect(page.getByRole('heading', { name: 'Choose what to export' })).toBeVisible();
  const exportControls = await page.evaluate(() => {
    const select = document.querySelector('.export-filter select');
    const input = document.querySelector('.export-filter input');
    const metrics = (element: Element | null) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        height: Math.round(element.getBoundingClientRect().height),
        font: style.fontSize,
        radius: style.borderRadius,
        border: style.borderColor,
        padding: style.padding,
      };
    };
    return { select: metrics(select), input: metrics(input) };
  });
  expect(exportControls.select).toEqual({
    height: 40,
    font: '14px',
    radius: '2px',
    border: 'rgb(148, 148, 148)',
    padding: '0px 24px 0px 12px',
  });
  expect(exportControls.input).toEqual({
    height: 40,
    font: '14px',
    radius: '2px',
    border: 'rgb(148, 148, 148)',
    padding: '0px 12px',
  });

  // Personal data request form.
  await page.goto('http://127.0.0.1:5173/admin/tools/export-personal-data');
  await expect(page.getByRole('heading', { name: 'Add Data Export Request' })).toBeVisible();
  const personal = await page.evaluate(() => {
    const input = document.querySelector('#requester-EXPORT');
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === 'Send Request',
    );
    const inputStyle = input ? getComputedStyle(input) : null;
    return {
      input: input
        ? {
            height: Math.round(input.getBoundingClientRect().height),
            radius: inputStyle?.borderRadius ?? null,
            border: inputStyle?.borderColor ?? null,
          }
        : null,
      button: button ? { height: Math.round(button.getBoundingClientRect().height) } : null,
    };
  });
  expect(personal.input).toEqual({ height: 40, radius: '2px', border: 'rgb(148, 148, 148)' });
  expect(personal.button).toEqual({ height: 40 });

  // Terms form controls and consent preview heading use the WordPress scale.
  await page.goto('http://127.0.0.1:5173/admin/terms?taxonomy=category');
  await expect(page.getByRole('heading', { name: 'Add Category' })).toBeVisible();
  const terms = await page.evaluate(() => {
    const input = document.querySelector('#term-new-name');
    const select = document.querySelector('#term-new-parent');
    const heading = document.querySelector('.terms-add-form h2');
    return {
      inputRadius: input ? getComputedStyle(input).borderRadius : null,
      selectRadius: select ? getComputedStyle(select).borderRadius : null,
      heading: heading
        ? { font: getComputedStyle(heading).fontSize, margin: getComputedStyle(heading).margin }
        : null,
    };
  });
  expect(terms.inputRadius).toBe('2px');
  expect(terms.selectRadius).toBe('2px');
  expect(terms.heading).toEqual({ font: '16.9px', margin: '16.9px 0px' });

  await page.goto('http://127.0.0.1:5173/admin/settings/consent');
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  const consent = await page.evaluate(() => {
    const heading = document.querySelector('.consent-preview h2');
    return heading
      ? { font: getComputedStyle(heading).fontSize, margin: getComputedStyle(heading).margin }
      : null;
  });
  expect(consent).toEqual({ font: '16.9px', margin: '16.9px 0px 8px' });

  // Customizer header and control scale (WordPress panel title 20/200 and
  // standard 40px form controls).
  await page.goto('http://127.0.0.1:5173/admin/themes/customize');
  await expect(page.getByRole('heading', { name: 'Customizing: MERNPress' })).toBeVisible();
  const customize = await page.evaluate(() => {
    const heading = document.querySelector('.customize-header h1');
    const input = document.querySelector(
      '.customize-panel .field input[type=text], .customize-panel .field input:not([type])',
    );
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const inputStyle = input ? getComputedStyle(input) : null;
    return {
      heading: headingStyle
        ? { font: headingStyle.fontSize, weight: headingStyle.fontWeight }
        : null,
      input: input
        ? {
            height: Math.round(input.getBoundingClientRect().height),
            radius: inputStyle?.borderRadius ?? null,
            border: inputStyle?.borderColor ?? null,
          }
        : null,
    };
  });
  expect(customize.heading).toEqual({ font: '20px', weight: '200' });
  expect(customize.input).toEqual({ height: 40, radius: '2px', border: 'rgb(148, 148, 148)' });

  // Mobile pass over every screen; import and redirects get explicit assertions
  // plus mobile screenshots because they previously overflowed or wrapped.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const screen of screens) {
    await page.goto(`http://127.0.0.1:5173${screen.route}`);
    await screen.wait();
    const metrics = await h1AndOverflow(page);
    expect(metrics.scrollWidth, `${screen.name} mobile overflow`).toBeLessThanOrEqual(
      metrics.innerWidth,
    );
    if (screen.mobileShot) {
      await testInfo.attach(`${screen.name}-mobile`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });
    }
  }

  await page.goto('http://127.0.0.1:5173/admin/tools/import');
  await expect(page.getByText('Blogger', { exact: true })).toBeVisible();
  const importMobile = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    tableWidth: Math.round(
      document.querySelector('.importers-table')!.getBoundingClientRect().width,
    ),
  }));
  expect(importMobile.scrollWidth).toBeLessThanOrEqual(importMobile.innerWidth);
  expect(importMobile.tableWidth).toBeLessThanOrEqual(importMobile.innerWidth);

  await page.goto('http://127.0.0.1:5173/admin/tools/redirects');
  await expect(page.getByRole('heading', { name: /Redirects \(/ })).toBeVisible();
  const redirectsMobile = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(redirectsMobile.scrollWidth).toBeLessThanOrEqual(redirectsMobile.innerWidth);
});

test('media derivative regeneration queues into Scheduled Actions', async ({ page }) => {
  await login(page);
  await page.goto('http://127.0.0.1:5173/admin/media');
  await expect(page.getByRole('heading', { name: 'Media Library' })).toBeVisible();

  await page.getByRole('button', { name: 'Regenerate image sizes' }).click();
  await expect(
    page.getByText(
      'Derivative regeneration queued for the whole library. Track it in Scheduled Actions.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View in Scheduled Actions' }).click();

  await expect(page.getByRole('heading', { name: 'Scheduled Actions' })).toBeVisible();
  const row = page.locator('.jobs-table tbody tr', { hasText: 'media.regenerate' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('pending');
  await expect(row.getByRole('button', { name: 'Cancel: media.regenerate' })).toBeVisible();
});
