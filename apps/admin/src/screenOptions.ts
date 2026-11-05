import {
  DEFAULT_SCREEN_OPTIONS,
  EDITOR_PANELS,
  SCREEN_OPTION_SCREENS,
  normalizeScreenOptions,
  type DashboardColumns,
  type EditorPanelId,
  type ScreenOptionScreen,
  type ScreenOptionsState,
  type ScreenViewMode,
} from '@mernpress/contracts';
import { saveScreenOptions } from './api.js';

/**
 * WordPress "Screen Options".
 *
 * The authoritative map lives on the user (`users.screen_options`). This module
 * keeps a synchronous cache in localStorage so the admin paints correctly before
 * the profile request returns; `hydrateScreenOptions` replaces it with the
 * server value and every setter mirrors the change back through a debounced
 * PUT. Components keep their existing getter/setter calls and custom events.
 */
export const SCREEN_OPTIONS_EVENT = 'mernpress:screen-options';
export const SCREEN_COLUMNS_EVENT = 'mernpress:screen-columns';
export const SCREEN_VIEW_MODE_EVENT = 'mernpress:screen-view-mode';
export const SCREEN_EDITOR_PANELS_EVENT = 'mernpress:editor-panels';
export const DASHBOARD_WIDGETS_EVENT = 'mernpress:dashboard-widgets';
export const DASHBOARD_COLUMNS_EVENT = 'mernpress:dashboard-columns';

const STORAGE_KEY = 'mernpress.screenOptions';

export interface ScreenColumn {
  id: string;
  label: string;
}

export const SCREEN_COLUMNS: Record<string, ScreenColumn[]> = {
  posts: [
    { id: 'author', label: 'Author' },
    { id: 'categories', label: 'Categories' },
    { id: 'tags', label: 'Tags' },
    { id: 'comments', label: 'Comments' },
    { id: 'date', label: 'Date' },
  ],
  pages: [
    { id: 'author', label: 'Author' },
    { id: 'comments', label: 'Comments' },
    { id: 'date', label: 'Date' },
  ],
  users: [
    { id: 'name', label: 'Name' },
    { id: 'email', label: 'Email' },
    { id: 'role', label: 'Role' },
    { id: 'posts', label: 'Posts' },
  ],
  terms: [
    { id: 'description', label: 'Description' },
    { id: 'slug', label: 'Slug' },
    { id: 'count', label: 'Count' },
  ],
  media: [
    { id: 'author', label: 'Author' },
    { id: 'parent', label: 'Uploaded to' },
    { id: 'date', label: 'Date' },
  ],
  comments: [
    { id: 'author', label: 'Author' },
    { id: 'comment', label: 'Comment' },
    { id: 'response', label: 'In response to' },
    { id: 'date', label: 'Submitted on' },
  ],
  plugins: [
    { id: 'description', label: 'Description' },
    { id: 'auto-updates', label: 'Automatic Updates' },
  ],
};

export interface DashboardWidget {
  id: string;
  label: string;
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'siteHealth', label: 'Site Health Status' },
  { id: 'glance', label: 'At a Glance' },
  { id: 'activity', label: 'Activity' },
  { id: 'quickDraft', label: 'Quick Draft' },
  { id: 'events', label: 'Events and News' },
];

export { EDITOR_PANELS };
export type { DashboardColumns, ScreenViewMode };

function readCache(): ScreenOptionsState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return normalizeScreenOptions(JSON.parse(raw));
  } catch {
    // Storage is optional.
  }
  return migrateLegacy();
}

/** One-time migration from the pre-per-user per-key localStorage layout. */
function migrateLegacy(): ScreenOptionsState {
  const legacy: Record<string, unknown> = {
    perPage: {},
    hiddenColumns: {},
    viewMode: {},
  };
  try {
    const perPage: Record<string, number> = {};
    const hiddenColumns: Record<string, string[]> = {};
    const viewMode: Record<string, string> = {};
    for (const screen of SCREEN_OPTION_SCREENS) {
      const perPageRaw = window.localStorage.getItem(`mernpress.perPage.${screen}`);
      const perPageValue = perPageRaw === null ? Number.NaN : Number(perPageRaw);
      if (Number.isInteger(perPageValue)) perPage[screen] = perPageValue;

      const columnsRaw = window.localStorage.getItem(`mernpress.hiddenColumns.${screen}`);
      if (columnsRaw !== null) {
        try {
          const parsed: unknown = JSON.parse(columnsRaw);
          if (Array.isArray(parsed)) {
            hiddenColumns[screen] = parsed.filter(
              (value): value is string => typeof value === 'string',
            );
          }
        } catch {
          // Ignore a corrupt old value.
        }
      }

      const modeRaw = window.localStorage.getItem(`mernpress.viewMode.${screen}`);
      if (modeRaw === 'compact' || modeRaw === 'extended') viewMode[screen] = modeRaw;
    }
    legacy['perPage'] = perPage;
    legacy['hiddenColumns'] = hiddenColumns;
    legacy['viewMode'] = viewMode;

    const dashboardRaw = window.localStorage.getItem('mernpress.dashboardHidden');
    if (dashboardRaw !== null) {
      const parsed: unknown = JSON.parse(dashboardRaw);
      if (Array.isArray(parsed)) legacy['dashboardHidden'] = parsed;
    }
    const columnsRaw = window.localStorage.getItem('mernpress.dashboardColumns');
    const columns = columnsRaw === null ? Number.NaN : Number(columnsRaw);
    if (Number.isInteger(columns)) legacy['dashboardColumns'] = columns;
  } catch {
    // Corrupt legacy storage: fall back to defaults.
  }
  return normalizeScreenOptions(legacy);
}

let state: ScreenOptionsState = readCache();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage is optional; the in-memory state still applies.
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void saveScreenOptions(state).catch(() => {
      // Offline or a transient API failure: the local cache remains usable and
      // the next change retries the whole map.
    });
  }, 300);
}

/** Force any pending write (tests and unload paths). */
export async function flushScreenOptionsSync(): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  await saveScreenOptions(state);
}

/** Replace the cache with the server map (called after the session loads). */
export function hydrateScreenOptions(value: unknown): void {
  state = normalizeScreenOptions(value);
  persist();
  window.dispatchEvent(new CustomEvent(SCREEN_COLUMNS_EVENT));
  window.dispatchEvent(new CustomEvent(SCREEN_VIEW_MODE_EVENT));
  window.dispatchEvent(new CustomEvent(SCREEN_OPTIONS_EVENT));
  window.dispatchEvent(new CustomEvent(SCREEN_EDITOR_PANELS_EVENT));
  window.dispatchEvent(new CustomEvent(DASHBOARD_WIDGETS_EVENT));
  window.dispatchEvent(new CustomEvent(DASHBOARD_COLUMNS_EVENT));
}

/** Current normalized state (read-only snapshot). */
export function screenOptionsSnapshot(): ScreenOptionsState {
  return state;
}

export function screenPerPage(screen: string, fallback: number): number {
  return state.perPage[screen as ScreenOptionScreen] ?? fallback;
}

export function setScreenPerPage(screen: string, value: number): void {
  state = {
    ...state,
    perPage: {
      ...state.perPage,
      [screen as ScreenOptionScreen]: Math.min(100, Math.max(1, Math.trunc(value))),
    },
  };
  persist();
  scheduleSync();
  window.dispatchEvent(new CustomEvent(SCREEN_OPTIONS_EVENT, { detail: { screen, value } }));
}

export function screenHiddenColumns(screen: string): Set<string> {
  return new Set(state.hiddenColumns[screen as ScreenOptionScreen] ?? []);
}

export function setScreenColumnHidden(screen: string, column: string, hidden: boolean): void {
  const next = screenHiddenColumns(screen);
  if (hidden) next.add(column);
  else next.delete(column);
  state = {
    ...state,
    hiddenColumns: {
      ...state.hiddenColumns,
      [screen as ScreenOptionScreen]: [...next],
    },
  };
  persist();
  scheduleSync();
  window.dispatchEvent(new CustomEvent(SCREEN_COLUMNS_EVENT, { detail: { screen } }));
}

export function screenViewMode(screen: string): ScreenViewMode {
  return state.viewMode[screen as ScreenOptionScreen] ?? 'extended';
}

export function setScreenViewMode(screen: string, mode: ScreenViewMode): void {
  state = {
    ...state,
    viewMode: { ...state.viewMode, [screen as ScreenOptionScreen]: mode },
  };
  persist();
  scheduleSync();
  window.dispatchEvent(new CustomEvent(SCREEN_VIEW_MODE_EVENT, { detail: { screen } }));
}

export function dashboardHiddenWidgets(): Set<string> {
  return new Set(state.dashboardHidden);
}

export function setDashboardWidgetHidden(id: string, hidden: boolean): void {
  const next = dashboardHiddenWidgets();
  if (hidden) next.add(id);
  else next.delete(id);
  state = { ...state, dashboardHidden: [...next] as ScreenOptionsState['dashboardHidden'] };
  persist();
  scheduleSync();
  window.dispatchEvent(new CustomEvent(DASHBOARD_WIDGETS_EVENT));
}

export function dashboardColumns(): DashboardColumns {
  return state.dashboardColumns;
}

export function setDashboardColumns(columns: DashboardColumns): void {
  state = { ...state, dashboardColumns: columns };
  persist();
  scheduleSync();
  window.dispatchEvent(new CustomEvent(DASHBOARD_COLUMNS_EVENT));
}

export function editorHiddenPanels(): Set<string> {
  return new Set(state.editorHiddenPanels);
}

export function setEditorPanelHidden(id: EditorPanelId, hidden: boolean): void {
  const next = editorHiddenPanels();
  if (hidden) next.add(id);
  else next.delete(id);
  state = {
    ...state,
    editorHiddenPanels: [...next] as EditorPanelId[],
  };
  persist();
  scheduleSync();
  window.dispatchEvent(new CustomEvent(SCREEN_EDITOR_PANELS_EVENT));
}

export { DEFAULT_SCREEN_OPTIONS };
