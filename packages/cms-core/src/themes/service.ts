import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import {
  DEFAULT_THEME_ID,
  loadThemeManifests,
  seedThemeStore,
  type ThemeManifest,
} from './registry.js';

export interface ThemeState extends ThemeManifest {
  active: boolean;
  autoUpdates: boolean;
}

export interface ThemeListResult {
  themes: ThemeState[];
  active: string;
}

export interface ThemeServiceOptions {
  prisma: DatabaseClient;
  /** Writable theme store (outside release directories). */
  themeDir: string;
  /** Bundled packages copied into an empty store once. */
  seedDir: string;
  /** Injected registry used by focused tests; skips the on-disk store. */
  themes?: readonly ThemeManifest[];
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

const ACTIVE_THEME_KEY = 'active_theme';
const AUTO_UPDATES_KEY = 'theme_auto_updates';

async function readOption<T>(prisma: DatabaseClient, key: string, fallback: T): Promise<T> {
  const row = await prisma.option.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function writeOption(
  prisma: DatabaseClient,
  key: string,
  value: unknown,
  group: string,
): Promise<void> {
  await prisma.option.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value), group },
    update: { value: JSON.stringify(value), group },
  });
}

export function createThemeService({
  prisma,
  themeDir,
  seedDir,
  themes: injected,
  logger,
}: ThemeServiceOptions) {
  async function installedManifests(): Promise<readonly ThemeManifest[]> {
    if (injected) return injected;
    await seedThemeStore({ storeDir: themeDir, seedDir, ...(logger ? { logger } : {}) });
    return loadThemeManifests(themeDir, logger);
  }

  async function activeId(manifests: readonly ThemeManifest[]): Promise<string> {
    const stored = await readOption<string>(prisma, ACTIVE_THEME_KEY, DEFAULT_THEME_ID);
    if (manifests.some((theme) => theme.id === stored)) return stored;
    return manifests.find((theme) => theme.id === DEFAULT_THEME_ID)?.id ?? manifests[0]?.id ?? '';
  }

  async function state(): Promise<ThemeListResult> {
    const [manifests, autoUpdates] = await Promise.all([
      installedManifests(),
      readOption<boolean>(prisma, AUTO_UPDATES_KEY, false),
    ]);
    const active = await activeId(manifests);
    return {
      active,
      themes: manifests.map((theme) => ({
        ...theme,
        active: theme.id === active,
        autoUpdates,
      })),
    };
  }

  async function list(principal: Principal): Promise<ThemeListResult> {
    requireCapability(principal, 'manage_options');
    return state();
  }

  async function activate(principal: Principal, id: string): Promise<ThemeListResult> {
    requireCapability(principal, 'manage_options');
    const manifests = await installedManifests();
    const theme = manifests.find((entry) => entry.id === id);
    if (!theme) {
      throw new ContentError('NOT_FOUND', 'Theme not found', 404);
    }
    await writeOption(prisma, ACTIVE_THEME_KEY, theme.id, 'appearance');
    return state();
  }

  async function setAutoUpdates(principal: Principal, enabled: boolean): Promise<ThemeListResult> {
    requireCapability(principal, 'manage_options');
    await writeOption(prisma, AUTO_UPDATES_KEY, enabled, 'appearance');
    return state();
  }

  /** The active theme for the public site (no capability; public data only). */
  async function active(): Promise<ThemeManifest | null> {
    const manifests = await installedManifests();
    const id = await activeId(manifests);
    return manifests.find((theme) => theme.id === id) ?? null;
  }

  /** Installed packages for update checks (no capability). */
  async function installed(): Promise<readonly ThemeManifest[]> {
    return installedManifests();
  }

  return { list, activate, setAutoUpdates, active, installed };
}

export type ThemeService = ReturnType<typeof createThemeService>;
