/**
 * WordPress "Screen Options" support.
 *
 * WordPress lets each list screen choose how many rows to show per page and
 * remembers that choice. We persist the same option in `localStorage` under a
 * screen key and notify mounted lists through a custom event so a change made
 * in the panel is applied without a reload.
 */

export const SCREEN_OPTIONS_EVENT = 'mernpress:screen-options';

const PREFIX = 'mernpress.perPage.';

export function screenPerPage(screen: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${screen}`);
    const value = raw === null ? Number.NaN : Number(raw);
    if (Number.isInteger(value) && value > 0 && value <= 100) {
      return value;
    }
  } catch {
    // Storage is optional (private mode, disabled cookies).
  }
  return fallback;
}

export function setScreenPerPage(screen: string, value: number): void {
  try {
    window.localStorage.setItem(`${PREFIX}${screen}`, String(value));
  } catch {
    // Storage is optional.
  }
  window.dispatchEvent(new CustomEvent(SCREEN_OPTIONS_EVENT, { detail: { screen, value } }));
}

/** WordPress list-table column toggles and view mode. */
export const SCREEN_COLUMNS_EVENT = 'mernpress:screen-columns';
export const SCREEN_VIEW_MODE_EVENT = 'mernpress:screen-view-mode';

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
};

const COLUMN_PREFIX = 'mernpress.hiddenColumns.';
const VIEW_MODE_PREFIX = 'mernpress.viewMode.';

export type ScreenViewMode = 'compact' | 'extended';

export function screenHiddenColumns(screen: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${COLUMN_PREFIX}${screen}`);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((value): value is string => typeof value === 'string'));
      }
    }
  } catch {
    // Storage is optional.
  }
  return new Set();
}

export function setScreenColumnHidden(screen: string, column: string, hidden: boolean): void {
  const next = screenHiddenColumns(screen);
  if (hidden) {
    next.add(column);
  } else {
    next.delete(column);
  }
  try {
    window.localStorage.setItem(`${COLUMN_PREFIX}${screen}`, JSON.stringify([...next]));
  } catch {
    // Storage is optional.
  }
  window.dispatchEvent(new CustomEvent(SCREEN_COLUMNS_EVENT, { detail: { screen } }));
}

export function screenViewMode(screen: string): ScreenViewMode {
  try {
    const raw = window.localStorage.getItem(`${VIEW_MODE_PREFIX}${screen}`);
    if (raw === 'compact' || raw === 'extended') {
      return raw;
    }
  } catch {
    // Storage is optional.
  }
  return 'extended';
}

export function setScreenViewMode(screen: string, mode: ScreenViewMode): void {
  try {
    window.localStorage.setItem(`${VIEW_MODE_PREFIX}${screen}`, mode);
  } catch {
    // Storage is optional.
  }
  window.dispatchEvent(new CustomEvent(SCREEN_VIEW_MODE_EVENT, { detail: { screen } }));
}
