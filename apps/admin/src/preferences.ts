/**
 * Per-browser admin preferences.
 *
 * WordPress stores personal options on the user; this build keeps the
 * browser-only preferences (colour scheme and keyboard shortcuts) in
 * localStorage and applies them live through custom events.
 */
export const KEYBOARD_SHORTCUTS_EVENT = 'mernpress:keyboard-shortcuts';

const KEYBOARD_SHORTCUTS_KEY = 'mernpress.keyboardShortcuts';

export function keyboardShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEYBOARD_SHORTCUTS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setKeyboardShortcuts(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEYBOARD_SHORTCUTS_KEY, enabled ? '1' : '0');
  } catch {
    // Storage is optional.
  }
  window.dispatchEvent(new CustomEvent(KEYBOARD_SHORTCUTS_EVENT));
}
