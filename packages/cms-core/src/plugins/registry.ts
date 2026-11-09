import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Plugin package store.
 *
 * Plugins are trusted local packages on disk (one directory per plugin with a
 * `plugin.json` manifest), stored outside release directories so deleting a
 * package is durable across deploys. The bundled packages in the repository's
 * `plugins/` directory seed an empty store once; after that the store is
 * authoritative and a deleted package is not re-created by a restart.
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  /** Short "what it does" line shown in the details row, like WordPress. */
  details: string;
  /** Lines a toolbar plugin rotates; empty/absent means no toolbar output. */
  toolbarLyrics?: readonly string[];
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MANIFEST_FILE = 'plugin.json';
const STORE_MARKER = '.initialized';

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    ? value.trim()
    : null;
}

/** Validate an untrusted manifest read from disk. */
export function validatePluginManifest(value: unknown): PluginManifest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = text(record['id'], 64);
  const name = text(record['name'], 200);
  const version = text(record['version'], 40);
  const author = text(record['author'], 200);
  const description = text(record['description'], 5000);
  const details = text(record['details'], 500);
  if (!id || !ID_PATTERN.test(id) || !name || !version || !author || !description || !details) {
    return null;
  }
  const rawLyrics = record['toolbarLyrics'];
  const toolbarLyrics = Array.isArray(rawLyrics)
    ? rawLyrics
        .filter((line): line is string => typeof line === 'string' && line.length <= 500)
        .slice(0, 50)
    : [];
  return {
    id,
    name,
    version,
    author,
    description,
    details,
    ...(toolbarLyrics.length > 0 ? { toolbarLyrics } : {}),
  };
}

export interface PluginStoreOptions {
  /** Writable directory holding installed plugin packages. */
  storeDir: string;
  /** Repository directory containing the bundled seed packages. */
  seedDir: string;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Seed the store exactly once. A marker file distinguishes a fresh store from
 * an empty one after the administrator deleted every plugin.
 */
export async function seedPluginStore({
  storeDir,
  seedDir,
  logger,
}: PluginStoreOptions): Promise<void> {
  try {
    await fs.access(path.join(storeDir, STORE_MARKER));
    return;
  } catch {
    // Not seeded yet.
  }

  await fs.mkdir(storeDir, { recursive: true });
  let entries: Dirent[] = [];
  let complete = true;
  try {
    entries = await fs.readdir(seedDir, { withFileTypes: true });
  } catch {
    complete = false;
    logger?.('plugin seed directory is missing', { seedDir });
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const destination = path.join(storeDir, entry.name);
    try {
      await fs.access(destination);
      continue; // Never overwrite an existing package.
    } catch {
      // Copy the bundled package.
    }
    try {
      await fs.cp(path.join(seedDir, entry.name), destination, { recursive: true });
    } catch (error) {
      complete = false;
      logger?.('plugin seed copy failed', {
        plugin: entry.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Retry the whole seed next start when anything failed (see themes).
  if (!complete) return;
  await fs.writeFile(
    path.join(storeDir, STORE_MARKER),
    `seeded ${new Date().toISOString()}\n`,
    'utf8',
  );
}

/** Read every valid package manifest from the store. */
export async function loadPluginManifests(
  storeDir: string,
  logger?: (message: string, meta?: Record<string, unknown>) => void,
): Promise<PluginManifest[]> {
  let entries;
  try {
    entries = await fs.readdir(storeDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const plugins: PluginManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const raw = await fs.readFile(path.join(storeDir, entry.name, MANIFEST_FILE), 'utf8');
      const manifest = validatePluginManifest(JSON.parse(raw));
      if (!manifest) {
        logger?.('plugin manifest is invalid', { plugin: entry.name });
        continue;
      }
      plugins.push(manifest);
    } catch {
      logger?.('plugin manifest could not be read', { plugin: entry.name });
    }
  }
  return plugins.sort((left, right) => left.name.localeCompare(right.name));
}

export function lyricFor(lyrics: readonly string[], seed: number): string {
  return lyrics[Math.abs(Math.trunc(seed)) % lyrics.length] ?? lyrics[0] ?? '';
}
