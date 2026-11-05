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
  const fonts = Array.isArray(record['fonts'])
    ? record['fonts']
        .map((font) => {
          if (typeof font !== 'object' || font === null) return null;
          const entry = font as Record<string, unknown>;
          const family = text(entry['family'], 200);
          const source = entry['source'] === 'system' ? 'system' : 'theme';
          const weights = Array.isArray(entry['weights'])
            ? entry['weights'].filter(
                (weight): weight is number => typeof weight === 'number' && weight >= 100,
              )
            : [];
          return family ? { family, weights, source } : null;
        })
        .filter((font): font is ThemeFont => font !== null)
    : [];
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

/** Seed the theme store exactly once (marker-guarded, like the plugin store). */
export async function seedThemeStore({
  storeDir,
  seedDir,
  logger,
}: ThemeStoreOptions): Promise<void> {
  try {
    await fs.access(path.join(storeDir, STORE_MARKER));
    return;
  } catch {
    // Not seeded yet.
  }
  await fs.mkdir(storeDir, { recursive: true });
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(seedDir, { withFileTypes: true });
  } catch {
    logger?.('theme seed directory is missing', { seedDir });
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const destination = path.join(storeDir, entry.name);
    try {
      await fs.access(destination);
      continue;
    } catch {
      // Copy the bundled package.
    }
    try {
      await fs.cp(path.join(seedDir, entry.name), destination, { recursive: true });
    } catch (error) {
      logger?.('theme seed copy failed', {
        theme: entry.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await fs.writeFile(
    path.join(storeDir, STORE_MARKER),
    `seeded ${new Date().toISOString()}\n`,
    'utf8',
  );
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
