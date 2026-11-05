import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import { loadPluginManifests, lyricFor, seedPluginStore, type PluginManifest } from './registry.js';

export interface PluginState extends PluginManifest {
  active: boolean;
  autoUpdates: boolean;
}

export interface PluginListResult {
  plugins: PluginState[];
  counts: { all: number; active: number; inactive: number };
}

export interface PluginServiceOptions {
  prisma: DatabaseClient;
  /** Writable plugin store (outside release directories). */
  pluginDir: string;
  /** Bundled packages copied into an empty store once. */
  seedDir: string;
  /** Injected registry used by focused tests; skips the on-disk store. */
  plugins?: readonly PluginManifest[];
  now?: () => Date;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

const ACTIVE_PLUGINS_KEY = 'active_plugins';
const AUTO_UPDATES_KEY = 'plugin_auto_updates';

async function readOption<T>(prisma: DatabaseClient, key: string, fallback: T): Promise<T> {
  const row = await prisma.option.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function writeOption(prisma: DatabaseClient, key: string, value: unknown): Promise<void> {
  await prisma.option.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value), group: 'plugins' },
    update: { value: JSON.stringify(value), group: 'plugins' },
  });
}

export function createPluginService({
  prisma,
  pluginDir,
  seedDir,
  plugins: injected,
  now = () => new Date(),
  logger,
}: PluginServiceOptions) {
  /** The installed packages, read from the authoritative store on each call. */
  async function installedManifests(): Promise<readonly PluginManifest[]> {
    if (injected) return injected;
    await seedPluginStore({ storeDir: pluginDir, seedDir, ...(logger ? { logger } : {}) });
    return loadPluginManifests(pluginDir, logger);
  }

  async function activeIds(installed?: readonly PluginManifest[]): Promise<string[]> {
    const [stored, manifests] = await Promise.all([
      readOption<string[]>(prisma, ACTIVE_PLUGINS_KEY, []),
      installed ? Promise.resolve(installed) : installedManifests(),
    ]);
    const known = new Set(manifests.map((plugin) => plugin.id));
    return Array.isArray(stored) ? stored.filter((id) => known.has(id)) : [];
  }

  async function state(): Promise<PluginListResult> {
    const manifests = await installedManifests();
    const [active, autoUpdates] = await Promise.all([
      activeIds(manifests),
      readOption<boolean>(prisma, AUTO_UPDATES_KEY, false),
    ]);
    const activeSet = new Set(active);
    const list = manifests.map((plugin) => ({
      ...plugin,
      active: activeSet.has(plugin.id),
      autoUpdates,
    }));
    return {
      plugins: list,
      counts: {
        all: list.length,
        active: list.filter((plugin) => plugin.active).length,
        inactive: list.filter((plugin) => !plugin.active).length,
      },
    };
  }

  async function list(principal: Principal): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    return state();
  }

  async function activate(principal: Principal, id: string): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    const manifests = await installedManifests();
    if (!manifests.some((plugin) => plugin.id === id)) {
      throw new ContentError('NOT_FOUND', 'Plugin not found', 404);
    }
    const active = await activeIds(manifests);
    if (!active.includes(id)) active.push(id);
    await writeOption(prisma, ACTIVE_PLUGINS_KEY, active);
    return state();
  }

  async function deactivate(principal: Principal, id: string): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    const manifests = await installedManifests();
    if (!manifests.some((plugin) => plugin.id === id)) {
      throw new ContentError('NOT_FOUND', 'Plugin not found', 404);
    }
    const active = (await activeIds(manifests)).filter((entry) => entry !== id);
    await writeOption(prisma, ACTIVE_PLUGINS_KEY, active);
    return state();
  }

  async function remove(principal: Principal, id: string): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    const manifests = await installedManifests();
    if (!manifests.some((plugin) => plugin.id === id)) {
      throw new ContentError('NOT_FOUND', 'Plugin not found', 404);
    }
    const active = await activeIds(manifests);
    if (active.includes(id)) {
      throw new ContentError('VALIDATION_ERROR', 'Deactivate the plugin before deleting it.', 409);
    }
    if (!injected) {
      // Real package removal: the directory (manifest and any assets) is gone.
      await fs.rm(path.join(pluginDir, id), { recursive: true, force: true });
    }
    return state();
  }

  async function setAutoUpdates(principal: Principal, enabled: boolean): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    await writeOption(prisma, AUTO_UPDATES_KEY, enabled);
    return state();
  }

  /** Installed packages for other services (update checks); no capability. */
  async function installed(): Promise<readonly PluginManifest[]> {
    return installedManifests();
  }

  /**
   * What the active plugins contribute to the admin toolbar. Empty when no
   * active plugin provides toolbar lyrics, so the shell renders nothing.
   */
  async function toolbar(principal: Principal): Promise<{ message: string | null }> {
    requireCapability(principal, 'manage_options');
    const manifests = await installedManifests();
    const active = await activeIds(manifests);
    const minute = Math.floor(now().getTime() / 60_000);
    for (const id of active) {
      const plugin = manifests.find((entry) => entry.id === id);
      if (plugin?.toolbarLyrics && plugin.toolbarLyrics.length > 0) {
        return { message: lyricFor(plugin.toolbarLyrics, minute) };
      }
    }
    return { message: null };
  }

  return { list, activate, deactivate, remove, setAutoUpdates, toolbar, installed };
}

export type PluginService = ReturnType<typeof createPluginService>;
