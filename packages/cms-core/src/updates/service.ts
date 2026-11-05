import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import type { ThemeManifest } from '../themes/registry.js';
import type { PluginManifest } from '../plugins/registry.js';

/** Version of the running MERNPress codebase (package.json version). */
export const CORE_VERSION = '0.1.0';

export type UpdateSource = 'manifest' | 'local';

export interface UpdateItem {
  id: string;
  name: string;
  type: 'core' | 'theme' | 'plugin';
  installedVersion: string;
  availableVersion: string | null;
  autoUpdates: boolean;
  status: 'current' | 'update' | 'unknown';
}

export interface UpdateStatus {
  coreVersion: string;
  source: UpdateSource;
  manifestConfigured: boolean;
  lastCheckedAt: string | null;
  items: UpdateItem[];
  updatesAvailable: number;
}

export interface UpdateServiceOptions {
  prisma: DatabaseClient;
  /** Configured release manifest endpoint (env), never user-supplied per request. */
  manifestUrl?: string | undefined;
  /** Installed plugin packages (store); empty when none are installed. */
  installedPlugins?: () => Promise<readonly PluginManifest[]>;
  /** Installed theme packages (store); empty when none are installed. */
  installedThemes?: () => Promise<readonly ThemeManifest[]>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface ManifestShape {
  core?: string;
  themes?: Record<string, string>;
  plugins?: Record<string, string>;
}

const LAST_CHECKED_KEY = 'updates_last_checked';
const LAST_RESULT_KEY = 'updates_last_result';
const MANIFEST_URL_KEY = 'update_manifest_url';

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
    create: { key, value: JSON.stringify(value), group: 'updates' },
    update: { value: JSON.stringify(value), group: 'updates' },
  });
}

/** Numeric semver comparison; anything unparsable is treated as older. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .split('-')[0]!
      .split('.')
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function createUpdateService({
  prisma,
  manifestUrl,
  installedPlugins = async () => [],
  installedThemes = async () => [],
  fetchImpl = fetch,
  now = () => new Date(),
}: UpdateServiceOptions) {
  async function configuredManifestUrl(): Promise<string | null> {
    const stored = await readOption<string>(prisma, MANIFEST_URL_KEY, '');
    const url = (manifestUrl ?? '').trim() || (typeof stored === 'string' ? stored.trim() : '');
    return url || null;
  }

  async function installedState(): Promise<{
    themeAutoUpdates: boolean;
    pluginAutoUpdates: boolean;
  }> {
    const [themeAutoUpdates, pluginAutoUpdates] = await Promise.all([
      readOption<boolean>(prisma, 'theme_auto_updates', false),
      readOption<boolean>(prisma, 'plugin_auto_updates', false),
    ]);
    return { themeAutoUpdates, pluginAutoUpdates };
  }

  async function compose(): Promise<UpdateStatus> {
    const [url, lastChecked, autoUpdates, lastResult] = await Promise.all([
      configuredManifestUrl(),
      readOption<string | null>(prisma, LAST_CHECKED_KEY, null),
      installedState(),
      readOption<{ available?: Record<string, string> } | null>(prisma, LAST_RESULT_KEY, null),
    ]);
    // Tolerate the flat legacy shape as well as the wrapped one.
    const published =
      lastResult && typeof lastResult === 'object' && 'available' in lastResult
        ? (lastResult.available ?? {})
        : ((lastResult ?? {}) as Record<string, string>);
    const [pluginList, themeList] = await Promise.all([installedPlugins(), installedThemes()]);
    const items: UpdateItem[] = [
      {
        id: 'core',
        name: 'MERNPress',
        type: 'core',
        installedVersion: CORE_VERSION,
        availableVersion: null,
        autoUpdates: false,
        status: 'current',
      },
      ...themeList.map<UpdateItem>((theme) => ({
        id: theme.id,
        name: theme.name,
        type: 'theme',
        installedVersion: theme.version,
        availableVersion: null,
        autoUpdates: autoUpdates.themeAutoUpdates,
        status: 'current',
      })),
      ...pluginList.map<UpdateItem>((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        type: 'plugin',
        installedVersion: plugin.version,
        availableVersion: null,
        autoUpdates: autoUpdates.pluginAutoUpdates,
        status: 'current',
      })),
    ];
    const merged = items.map((item) => {
      const available = published[item.id];
      if (typeof available !== 'string') return item;
      const newer = compareVersions(available, item.installedVersion) > 0;
      return {
        ...item,
        availableVersion: available,
        status: newer ? ('update' as const) : ('current' as const),
      };
    });
    return {
      coreVersion: CORE_VERSION,
      source: url ? 'manifest' : 'local',
      manifestConfigured: Boolean(url),
      lastCheckedAt: typeof lastChecked === 'string' ? lastChecked : null,
      items: merged,
      updatesAvailable: merged.filter((item) => item.status === 'update').length,
    };
  }

  /**
   * Runs a real check. With a configured manifest it compares every installed
   * component against the published versions; without one it only re-reads the
   * installed versions and says so (no fake "latest" claim).
   */
  async function status(principal: Principal): Promise<UpdateStatus> {
    requireCapability(principal, 'manage_options');
    return compose();
  }

  async function check(principal: Principal): Promise<UpdateStatus> {
    requireCapability(principal, 'manage_options');
    const current = await compose();
    const url = await configuredManifestUrl();
    if (!url) {
      const checkedAt = now().toISOString();
      await writeOption(prisma, LAST_CHECKED_KEY, checkedAt);
      await writeOption(prisma, LAST_RESULT_KEY, null);
      return {
        ...current,
        lastCheckedAt: checkedAt,
        items: current.items.map((item) => ({
          ...item,
          availableVersion: null,
          status: 'current' as const,
        })),
        updatesAvailable: 0,
      };
    }

    let manifest: ManifestShape;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) {
        throw new ContentError(
          'UPDATE_CHECK_FAILED',
          `The update service returned ${response.status}.`,
          502,
        );
      }
      manifest = (await response.json()) as ManifestShape;
    } catch (error) {
      if (error instanceof ContentError) throw error;
      throw new ContentError(
        'UPDATE_CHECK_FAILED',
        'The update service could not be reached.',
        502,
      );
    }

    const items = current.items.map((item) => {
      const available =
        item.type === 'core'
          ? manifest.core
          : item.type === 'theme'
            ? manifest.themes?.[item.id]
            : manifest.plugins?.[item.id];
      if (typeof available !== 'string') {
        return item;
      }
      const newer = compareVersions(available, item.installedVersion) > 0;
      return {
        ...item,
        availableVersion: available,
        status: newer ? ('update' as const) : ('current' as const),
      };
    });
    const checkedAt = now().toISOString();
    await writeOption(prisma, LAST_CHECKED_KEY, checkedAt);
    await writeOption(prisma, LAST_RESULT_KEY, {
      available: Object.fromEntries(
        items
          .filter((item) => typeof item.availableVersion === 'string')
          .map((item) => [item.id, item.availableVersion as string]),
      ),
    });
    return {
      ...current,
      lastCheckedAt: checkedAt,
      items,
      updatesAvailable: items.filter((item) => item.status === 'update').length,
    };
  }

  return { status, check, configuredManifestUrl };
}

export type UpdateService = ReturnType<typeof createUpdateService>;
