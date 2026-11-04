import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import { PLUGINS, findPlugin, lyricFor, type PluginManifest } from './registry.js';

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
  /** Injected in tests so activation can be exercised without shipping plugins. */
  plugins?: readonly PluginManifest[];
  /** Minute-resolution clock so the rotating lyric is deterministic in tests. */
  now?: () => Date;
}

const ACTIVE_PLUGINS_KEY = 'active_plugins';
const DELETED_PLUGINS_KEY = 'deleted_plugins';
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
  plugins = PLUGINS,
  now = () => new Date(),
}: PluginServiceOptions) {
  async function deletedIds(): Promise<string[]> {
    const stored = await readOption<string[]>(prisma, DELETED_PLUGINS_KEY, []);
    const known = new Set(plugins.map((plugin) => plugin.id));
    return Array.isArray(stored) ? stored.filter((id) => known.has(id)) : [];
  }

  async function activeIds(): Promise<string[]> {
    const [stored, deleted] = await Promise.all([
      readOption<string[]>(prisma, ACTIVE_PLUGINS_KEY, []),
      deletedIds(),
    ]);
    const known = new Set(plugins.map((plugin) => plugin.id));
    const deletedSet = new Set(deleted);
    return Array.isArray(stored) ? stored.filter((id) => known.has(id) && !deletedSet.has(id)) : [];
  }

  async function state(): Promise<PluginListResult> {
    const [active, autoUpdates, deleted] = await Promise.all([
      activeIds(),
      readOption<boolean>(prisma, AUTO_UPDATES_KEY, false),
      deletedIds(),
    ]);
    const activeSet = new Set(active);
    const deletedSet = new Set(deleted);
    const list = plugins
      .filter((plugin) => !deletedSet.has(plugin.id))
      .map((plugin) => ({
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
    if (!findPluginIn(plugins, id)) {
      throw new ContentError('NOT_FOUND', 'Plugin not found', 404);
    }
    const active = await activeIds();
    if (!active.includes(id)) active.push(id);
    await writeOption(prisma, ACTIVE_PLUGINS_KEY, active);
    return state();
  }

  async function deactivate(principal: Principal, id: string): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    if (!findPluginIn(plugins, id)) {
      throw new ContentError('NOT_FOUND', 'Plugin not found', 404);
    }
    const active = (await activeIds()).filter((entry) => entry !== id);
    await writeOption(prisma, ACTIVE_PLUGINS_KEY, active);
    return state();
  }

  async function remove(principal: Principal, id: string): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    if (!findPluginIn(plugins, id)) {
      throw new ContentError('NOT_FOUND', 'Plugin not found', 404);
    }
    const deleted = await deletedIds();
    if (deleted.includes(id)) {
      throw new ContentError('NOT_FOUND', 'Plugin not found', 404);
    }
    const active = await activeIds();
    if (active.includes(id)) {
      throw new ContentError('VALIDATION_ERROR', 'Deactivate the plugin before deleting it.', 409);
    }
    deleted.push(id);
    await writeOption(prisma, DELETED_PLUGINS_KEY, deleted);
    return state();
  }

  async function setAutoUpdates(principal: Principal, enabled: boolean): Promise<PluginListResult> {
    requireCapability(principal, 'manage_options');
    await writeOption(prisma, AUTO_UPDATES_KEY, enabled);
    return state();
  }

  /**
   * What the active plugins contribute to the admin toolbar. Empty when no
   * toolbar plugin is active, so the shell renders nothing.
   */
  async function toolbar(principal: Principal): Promise<{ message: string | null }> {
    requireCapability(principal, 'manage_options');
    const active = await activeIds();
    if (!active.includes('hello-mernpress')) {
      return { message: null };
    }
    const minute = Math.floor(now().getTime() / 60_000);
    return { message: lyricFor(minute) };
  }

  return { list, activate, deactivate, remove, setAutoUpdates, toolbar };
}

function findPluginIn(plugins: readonly PluginManifest[], id: string): PluginManifest | undefined {
  if (plugins === PLUGINS) {
    return findPlugin(id);
  }
  return plugins.find((plugin) => plugin.id === id);
}

export type PluginService = ReturnType<typeof createPluginService>;
