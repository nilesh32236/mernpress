/**
 * Public light/dark switch — end-to-end contract.
 *
 * The visitor's choice lives in the `mernpress_color_scheme` cookie so the
 * server can render the matching palette on the first byte; the toggle in the
 * site header flips the `data-color-scheme` attribute on `<html>` without a
 * reload. The palette itself belongs to the active theme, so every colour
 * asserted here is read from `GET /api/public/site` instead of being
 * hard-coded.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const SITE = 'http://127.0.0.1:3000';
const API = `http://127.0.0.1:${process.env['E2E_API_PORT'] ?? 4000}`;
const COLOR_SCHEME_COOKIE = 'mernpress_color_scheme';

interface PublicThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  dark?: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
  } | null;
}

interface PublicSitePayload {
  theme: { id: string; name: string; layout: string; tokens: PublicThemeTokens } | null;
  customColors?: { background?: string } | null;
}

type Rgb = { r: number; g: number; b: number };

/** The public site payload: identity, layout variant and design tokens. */
async function fetchSitePayload(request: APIRequestContext): Promise<PublicSitePayload> {
  const response = await request.get(`${API}/api/public/site`);
  expect(response.status(), 'GET /api/public/site').toBe(200);
  return (await response.json()) as PublicSitePayload;
}

/**
 * The background the public site must paint per scheme. The customizer
 * overrides the light background; the theme owns the dark palette.
 */
function lightBackground(payload: PublicSitePayload): string {
  const background = payload.customColors?.background ?? payload.theme?.tokens.background;
  if (!background) throw new Error('The public site published no light background');
  return background;
}

function darkBackground(payload: PublicSitePayload): string {
  const background = payload.theme?.tokens.dark?.background;
  if (!background) {
    throw new Error(
      `The active theme "${payload.theme?.id ?? 'unknown'}" publishes no dark palette`,
    );
  }
  return background;
}

/** A hex colour (#rgb / #rrggbb) as the channels the browser computes. */
function hexToRgb(color: string): Rgb {
  const hex = color.trim().replace(/^#/, '');
  const value = hex.length === 3 ? hex.replace(/./g, (char) => char + char) : hex;
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Unsupported colour value: ${color}`);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

/** The channels of a computed colour, so alpha differences cannot matter. */
function toRgb(color: string): Rgb {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (!match) throw new Error(`Unsupported computed colour: ${color}`);
  const [, r, g, b] = match;
  return { r: Number(r), g: Number(g), b: Number(b) };
}

async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function htmlScheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-color-scheme'));
}

/**
 * Wait until React hydrated the toggle. The button is server-rendered, so it
 * is visible before its click handler exists; clicking earlier would be a
 * no-op instead of a scheme change.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const toggle = document.querySelector('[data-testid="theme-toggle"]');
    return toggle ? Object.keys(toggle).some((key) => key.startsWith('__react')) : false;
  });
}

/**
 * The installed theme package lives in a writable store that is seeded once
 * from the release `themes/` directory, so an installation that predates the
 * dark palette keeps serving a manifest without it and the public site never
 * receives a dark palette. Install the current release manifest of the active
 * theme for the duration of this spec and restore the previous copy
 * afterwards, so the contract runs against the theme that ships with the
 * release.
 */
function themeStoreDir(): string {
  const configured = process.env['THEME_STORAGE_DIR'];
  if (configured) return path.resolve(repoRoot, 'apps', 'api', configured);
  return path.join(repoRoot, '.data', 'themes');
}

let restoreThemeManifest: (() => void) | null = null;

test.beforeAll(async ({ request }) => {
  const payload = await fetchSitePayload(request);
  const themeId = payload.theme?.id;
  if (!themeId) throw new Error('The public site published no active theme');

  const releaseManifest = path.join(repoRoot, 'themes', themeId, 'theme.json');
  const installedManifest = path.join(themeStoreDir(), themeId, 'theme.json');
  if (!existsSync(releaseManifest) || !existsSync(installedManifest)) return;

  const release = JSON.parse(readFileSync(releaseManifest, 'utf8')) as {
    tokens?: { dark?: unknown } | null;
  };
  const installed = JSON.parse(readFileSync(installedManifest, 'utf8')) as {
    tokens?: { dark?: unknown } | null;
  };
  // The installed package already carries a dark palette: nothing to do.
  if (installed.tokens?.dark) return;
  if (!release.tokens?.dark) return;

  const backup = readFileSync(installedManifest);
  const temporary = `${installedManifest}.tmp`;
  writeFileSync(temporary, readFileSync(releaseManifest));
  renameSync(temporary, installedManifest);
  restoreThemeManifest = () => {
    writeFileSync(installedManifest, backup);
  };
});

test.afterAll(() => {
  restoreThemeManifest?.();
  restoreThemeManifest = null;
});

test('without a cookie the site follows the operating system preference', async ({
  page,
  request,
}) => {
  const payload = await fetchSitePayload(request);
  const light = lightBackground(payload);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });

  expect(await htmlScheme(page), 'no cookie means no explicit scheme').toBeNull();
  const toggle = page.getByTestId('theme-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAccessibleName('Switch to dark mode');
  expect(toRgb(await bodyBackground(page)), 'the light palette is painted').toEqual(
    hexToRgb(light),
  );
});

test('the toggle switches to the dark palette and remembers the choice', async ({
  page,
  request,
}) => {
  const payload = await fetchSitePayload(request);
  const light = lightBackground(payload);
  const dark = darkBackground(payload);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);

  await page.getByTestId('theme-toggle').click();

  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  const cookie = (await page.context().cookies()).find(
    (entry) => entry.name === COLOR_SCHEME_COOKIE,
  );
  expect(cookie?.value, 'the choice is stored in a cookie').toBe('dark');
  await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('Switch to light mode');
  const background = toRgb(await bodyBackground(page));
  expect(background, 'the dark palette is painted').toEqual(hexToRgb(dark));
  expect(background, 'the dark palette is not the light one').not.toEqual(hexToRgb(light));
});

test('the server renders the dark palette on the first byte', async ({
  page,
  request,
  context,
}) => {
  const payload = await fetchSitePayload(request);
  const dark = darkBackground(payload);

  // A returning visitor: the choice is already in the cookie, so the very
  // first response must carry the dark scheme.
  await context.addCookies([{ name: COLOR_SCHEME_COOKIE, value: 'dark', url: SITE }]);
  const response = await page.request.get(SITE);
  expect(response.status()).toBe(200);
  expect(await response.text(), 'the first byte carries the scheme').toContain(
    'data-color-scheme="dark"',
  );

  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  expect(toRgb(await bodyBackground(page)), 'the dark palette is painted').toEqual(hexToRgb(dark));
});

test('toggling again returns to the light palette', async ({ page, request }) => {
  const payload = await fetchSitePayload(request);
  const light = lightBackground(payload);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);

  const toggle = page.getByTestId('theme-toggle');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
  await expect(toggle).toHaveAccessibleName('Switch to dark mode');
  expect(toRgb(await bodyBackground(page)), 'the light palette is painted again').toEqual(
    hexToRgb(light),
  );
});

test('clearing the cookie returns the site to the operating system preference', async ({
  page,
  request,
}) => {
  const payload = await fetchSitePayload(request);
  const light = lightBackground(payload);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);

  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');

  await page.context().clearCookies();
  await page.reload({ waitUntil: 'domcontentloaded' });

  expect(await htmlScheme(page), 'the attribute disappears with the cookie').toBeNull();
  await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('Switch to dark mode');
  expect(toRgb(await bodyBackground(page)), 'the operating system colour is painted').toEqual(
    hexToRgb(light),
  );
});
