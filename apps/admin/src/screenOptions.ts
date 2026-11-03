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
