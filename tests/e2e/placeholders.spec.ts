import { expect, test, type Page } from '@playwright/test';

const ADMIN_URL = 'http://127.0.0.1:5173/admin/';
// The web dev server binds to 127.0.0.1 (apps/web/package.json dev script).
// Use the IPv4 literal here: on hosts where `localhost` resolves to ::1 first,
// Chrome cannot reach the IPv4-only listener and the smoke test fails.
const WEB_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://127.0.0.1:4000';

function trackBrowserErrors(page: Page): {
  consoleErrors: string[];
  failedRequests: string[];
} {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (message) => {
    // The anonymous admin page intentionally probes /api/auth/session and
    // expects a 401. Chrome reports that expected network status as a console
    // error; it is not an application error. Auth tests cover the 401 path.
    const expectedSessionProbe =
      message.text().includes('Failed to load resource') &&
      message.text().includes('401 (Unauthorized)');

    if (message.type() === 'error' && !expectedSessionProbe) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });
  page.on('response', (response) => {
    const type = response.request().resourceType();
    if (response.status() >= 400 && ['document', 'script', 'stylesheet'].includes(type)) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  return { consoleErrors, failedRequests };
}

test('admin login page boots without console or asset errors', async ({ page }) => {
  const errors = trackBrowserErrors(page);

  await page.goto(ADMIN_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'MERNPress admin' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();

  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedRequests).toEqual([]);
});

test('public site boots without console or asset errors', async ({ page }) => {
  const errors = trackBrowserErrors(page);

  await page.goto(WEB_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'MERNPress' })).toBeVisible();
  // The home header always renders "Latest published posts." and, when the
  // database is empty, also renders the empty-state text. `.or()` alone matches
  // both and trips strict mode, so take the first match.
  await expect(
    page
      .getByText('Latest published posts.')
      .or(page.getByText('No posts published yet. Nothing to read yet.'))
      .first(),
  ).toBeVisible();

  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedRequests).toEqual([]);
});

test('API liveness responds while the browser placeholders are running', async ({ request }) => {
  const response = await request.get(`${API_URL}/api/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    status: 'ok',
    service: 'mernpress-api',
  });
});
