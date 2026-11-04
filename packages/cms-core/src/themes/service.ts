import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import { DEFAULT_THEME_ID, THEMES, findTheme, type ThemeManifest } from './registry.js';

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

export function createThemeService({ prisma }: ThemeServiceOptions) {
  async function state(): Promise<ThemeListResult> {
    const [activeId, autoUpdates] = await Promise.all([
      readOption<string>(prisma, ACTIVE_THEME_KEY, DEFAULT_THEME_ID),
      readOption<boolean>(prisma, AUTO_UPDATES_KEY, false),
    ]);
    const active = findTheme(activeId) ? activeId : DEFAULT_THEME_ID;
    return {
      active,
      themes: THEMES.map((theme) => ({
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
    const theme = findTheme(id);
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

  return { list, activate, setAutoUpdates };
}

export type ThemeService = ReturnType<typeof createThemeService>;
