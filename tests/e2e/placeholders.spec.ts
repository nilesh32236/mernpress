import { expect, test, type Page } from '@playwright/test';

const ADMIN_URL = 'http://127.0.0.1:5173/admin';
const WEB_URL = 'http://localhost:3000';
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

test('public placeholder boots without console or asset errors', async ({ page }) => {
  const errors = trackBrowserErrors(page);

  await page.goto(WEB_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'MERNPress' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open the admin placeholder/ })).toBeVisible();

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
