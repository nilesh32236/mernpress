import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Theme package store.
 *
 * A theme is a trusted local package with a `theme.json` manifest in a writable
 * store (`THEME_STORAGE_DIR`), seeded once from the release `themes/` directory.
 * Themes control design tokens and a small layout variant; they do not execute
 * server code.
 */
export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  contentWidth: string;
  radius: string;
  headerAlign: 'left' | 'center';
  /**
   * Optional dark palette. When present the public site can offer a
   * light/dark switch; the values replace the five colour tokens in dark mode.
   */
  dark?: ThemeDarkTokens | undefined;
}

/** The five colours a theme may override for the dark palette. */
export interface ThemeDarkTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
}

export interface ThemeFont {
  family: string;
  weights: number[];
  source: 'theme' | 'system';
}

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: { name: string; url: string | null };
  description: string;
  tags: string[];
  /** Path (under the admin public dir) to the theme screenshot. */
  screenshot: string;
  /** Theme supports, shown in Theme Details like WordPress's feature list. */
  features: string[];
  /** Font families the theme ships (Appearance → Fonts). */
  fonts: ThemeFont[];
  /** Layout variant understood by the public site. */
  layout: 'classic' | 'journal';
  /** Design tokens injected as CSS custom properties. */
  tokens: ThemeTokens;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MANIFEST_FILE = 'theme.json';
const STORE_MARKER = '.initialized';
const HEADER_ALIGNMENTS = new Set(['left', 'center']);
const LAYOUTS = new Set(['classic', 'journal']);

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    ? value.trim()
    : null;
}

/** Hex colour only: #rgb, #rgba, #rrggbb, #rrggbbaa. */
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** CSS length/percentage; `0` is also accepted. */
const LENGTH_PATTERN = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em|%))$/;
/** Font stacks: letters, digits, spaces and the punctuation used in stacks. */
const FONT_STACK_PATTERN = /^[A-Za-z0-9 _,'"()\-.,%]+$/;
/** Bundled screenshot assets only: a rooted file name, no traversal or scheme. */
const SCREENSHOT_PATTERN = /^\/[A-Za-z0-9._-]+$/;

/**
 * Validate the optional dark palette. A present but malformed palette rejects
 * the manifest instead of silently falling back to a half-dark theme.
 */
function darkTokenGroup(value: unknown): ThemeDarkTokens | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const background = text(record['background'], 60);
  const surface = text(record['surface'], 60);
  const color = text(record['text'], 60);
  const muted = text(record['muted'], 60);
  const accent = text(record['accent'], 60);
  if (!background || !surface || !color || !muted || !accent) return null;
  if (![background, surface, color, muted, accent].every((token) => COLOR_PATTERN.test(token))) {
    return null;
  }
  return { background, surface, text: color, muted, accent };
}

function tokenGroup(value: unknown): ThemeTokens | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const background = text(record['background'], 60);
  const surface = text(record['surface'], 60);
  const color = text(record['text'], 60);
  const muted = text(record['muted'], 60);
  const accent = text(record['accent'], 60);
  const headingFont = text(record['headingFont'], 200);
  const bodyFont = text(record['bodyFont'], 200);
  const contentWidth = text(record['contentWidth'], 20);
  const radius = text(record['radius'], 20);
  const headerAlign = text(record['headerAlign'], 10);
  if (
    !background ||
    !surface ||
    !color ||
    !muted ||
    !accent ||
    !headingFont ||
    !bodyFont ||
    !contentWidth ||
    !radius ||
    !headerAlign ||
    !HEADER_ALIGNMENTS.has(headerAlign)
  ) {
    return null;
  }
  // Values land in CSS custom properties; reject anything that is not a plain
  // colour, length or font stack so a manifest cannot inject extra rules.
  if (
    ![background, surface, color, muted, accent].every((token) => COLOR_PATTERN.test(token)) ||
    ![contentWidth, radius].every((token) => LENGTH_PATTERN.test(token)) ||
    ![headingFont, bodyFont].every((token) => FONT_STACK_PATTERN.test(token))
  ) {
    return null;
  }
  const dark = darkTokenGroup(record['dark']);
  if (dark === null) return null;
  return {
    background,
    surface,
    text: color,
    muted,
    accent,
    headingFont,
    bodyFont,
    contentWidth,
    radius,
    headerAlign: headerAlign as ThemeTokens['headerAlign'],
    ...(dark ? { dark } : {}),
  };
}

/** Validate an untrusted manifest read from disk. */
export function validateThemeManifest(value: unknown): ThemeManifest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = text(record['id'], 64);
  const name = text(record['name'], 200);
  const version = text(record['version'], 40);
  const description = text(record['description'], 5000);
  const screenshot = text(record['screenshot'], 400);
  const layout = text(record['layout'], 20);
  if (!id || !ID_PATTERN.test(id) || !name || !version || !description || !screenshot) {
    return null;
  }
  if (!SCREENSHOT_PATTERN.test(screenshot)) return null;
  if (!layout || !LAYOUTS.has(layout)) return null;
  const authorRaw = record['author'];
  const author =
    typeof authorRaw === 'object' && authorRaw !== null && !Array.isArray(authorRaw)
      ? {
          name: text((authorRaw as Record<string, unknown>)['name'], 200) ?? 'Unknown',
          url: text((authorRaw as Record<string, unknown>)['url'], 500),
        }
      : { name: 'Unknown', url: null };
  const tokens = tokenGroup(record['tokens']);
  if (!tokens) return null;
  const tags = Array.isArray(record['tags'])
    ? record['tags'].filter((tag): tag is string => typeof tag === 'string' && tag.length <= 60)
    : [];
  const features = Array.isArray(record['features'])
    ? record['features'].filter(
        (feature): feature is string => typeof feature === 'string' && feature.length <= 200,
      )
    : [];
  let invalidFont = false;
  const fonts = Array.isArray(record['fonts'])
    ? record['fonts']
        .map((font) => {
          if (typeof font !== 'object' || font === null) {
            invalidFont = true;
            return null;
          }
          const entry = font as Record<string, unknown>;
          const family = text(entry['family'], 200);
          const source = entry['source'] === 'system' ? 'system' : 'theme';
          const rawWeights = entry['weights'];
          if (rawWeights !== undefined && !Array.isArray(rawWeights)) {
            invalidFont = true;
            return null;
          }
          const weights = Array.isArray(rawWeights) ? rawWeights : [];
          if (
            !weights.every(
              (weight) =>
                typeof weight === 'number' &&
                Number.isInteger(weight) &&
                weight >= 100 &&
                weight <= 900,
            )
          ) {
            invalidFont = true;
            return null;
          }
          return family ? { family, weights, source } : null;
        })
        .filter((font): font is ThemeFont => font !== null)
    : [];
  if (invalidFont) return null;
  return {
    id,
    name,
    version,
    author,
    description,
    tags,
    screenshot,
    features,
    fonts,
    layout: layout as ThemeManifest['layout'],
    tokens,
  };
}

export interface ThemeStoreOptions {
  storeDir: string;
  seedDir: string;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

/** Stores already verified against the release seed in this process. */
const verifiedThemeStores = new Set<string>();

/** Compare dotted numeric versions so 1.10.0 sorts after 1.9.0. */
function compareVersions(left: string, right: string): number {
  const a = left.split('.');
  const b = right.split('.');
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference =
      (Number.parseInt(a[index] ?? '0', 10) || 0) - (Number.parseInt(b[index] ?? '0', 10) || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The version declared by a theme package, or null when it cannot be read. */
async function themeVersion(dir: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(dir, 'theme.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * Seed the theme store (marker-guarded, like the plugin store) and keep the
 * bundled themes current.
 *
 * A release can add or change fields in a bundled manifest (the dark palette,
 * for example). The store is writable, so a package that was seeded once would
 * otherwise pin the old manifest forever. Theme packages cannot be edited in
 * the admin (the file editors are excluded by decision), so replacing an older
 * bundled version cannot overwrite an operator's work. The check runs on every
 * manifest read, so the result is memoised per process.
 */
export async function seedThemeStore({
  storeDir,
  seedDir,
  logger,
}: ThemeStoreOptions): Promise<void> {
  if (verifiedThemeStores.has(storeDir)) return;

  let seeded = true;
  try {
    await fs.access(path.join(storeDir, STORE_MARKER));
  } catch {
    seeded = false;
  }
  if (!seeded) await fs.mkdir(storeDir, { recursive: true });

  let entries: Dirent[] = [];
  let complete = true;
  try {
    entries = await fs.readdir(seedDir, { withFileTypes: true });
  } catch {
    complete = false;
    logger?.('theme seed directory is missing', { seedDir });
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const destination = path.join(storeDir, entry.name);
    if (seeded) {
      const [seedVersion, installedVersion] = await Promise.all([
        themeVersion(path.join(seedDir, entry.name)),
        themeVersion(destination),
      ]);
      // No newer bundled version: keep the installed package untouched.
      if (!seedVersion) continue;
      if (installedVersion && compareVersions(seedVersion, installedVersion) <= 0) continue;
    }
    try {
      await fs.cp(path.join(seedDir, entry.name), destination, { recursive: true, force: true });
      if (seeded) {
        logger?.('theme package refreshed from the release', { theme: entry.name });
      }
    } catch (error) {
      complete = false;
      logger?.('theme seed copy failed', {
        theme: entry.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // Write the marker only after a complete seed so a transient failure (or a
  // missing seed directory) is retried on the next start instead of leaving a
  // permanently half-seeded store.
  if (!complete) return;
  if (!seeded) {
    await fs.writeFile(
      path.join(storeDir, STORE_MARKER),
      `seeded ${new Date().toISOString()}\n`,
      'utf8',
    );
  }
  verifiedThemeStores.add(storeDir);
}

/** Read every valid theme manifest from the store. */
export async function loadThemeManifests(
  storeDir: string,
  logger?: (message: string, meta?: Record<string, unknown>) => void,
): Promise<ThemeManifest[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(storeDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const themes: ThemeManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const raw = await fs.readFile(path.join(storeDir, entry.name, MANIFEST_FILE), 'utf8');
      const manifest = validateThemeManifest(JSON.parse(raw));
      if (!manifest) {
        logger?.('theme manifest is invalid', { theme: entry.name });
        continue;
      }
      themes.push(manifest);
    } catch {
      logger?.('theme manifest could not be read', { theme: entry.name });
    }
  }
  return themes.sort((left, right) => left.name.localeCompare(right.name));
}

/** The built-in fallback when the store is empty or the active id is gone. */
export const DEFAULT_THEME_ID = 'mernpress';
