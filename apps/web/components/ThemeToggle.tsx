'use client';

import { useEffect, useState } from 'react';
import {
  COLOR_SCHEME_ATTRIBUTE,
  readColorSchemeCookie,
  writeColorSchemeCookie,
  type ColorScheme,
} from '@/lib/color-scheme';

interface ThemeToggleProps {
  /** Label shown while the site is in the light palette. */
  darkLabel: string;
  /** Label shown while the site is in the dark palette. */
  lightLabel: string;
  /**
   * Scheme known by the server (from the cookie). `null` means the visitor has
   * no explicit choice yet, so the operating system decides.
   */
  initialScheme: ColorScheme | null;
}

/**
 * Light/dark switch for the public site.
 *
 * The server renders the palette that matches the visitor's cookie, so the
 * first paint is already correct. This button only has to remember the
 * current scheme, write the new choice to the cookie and flip the attribute
 * on `<html>`; the stylesheet does the rest.
 */
export default function ThemeToggle({ darkLabel, lightLabel, initialScheme }: ThemeToggleProps) {
  // The server cannot know the operating system preference, so until the
  // client resolves it the site is treated as light. The effect below corrects
  // the label before the visitor can read it as wrong for long.
  const [scheme, setScheme] = useState<ColorScheme>(initialScheme ?? 'light');

  useEffect(() => {
    const stored = readColorSchemeCookie();
    if (stored) {
      setScheme(stored);
      return;
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setScheme(query.matches ? 'dark' : 'light');
    const onChange = (event: MediaQueryListEvent) => {
      setScheme(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    const next: ColorScheme = scheme === 'dark' ? 'light' : 'dark';
    setScheme(next);
    writeColorSchemeCookie(next);
    document.documentElement.setAttribute(COLOR_SCHEME_ATTRIBUTE, next);
  }

  const label = scheme === 'dark' ? lightLabel : darkLabel;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      data-scheme={scheme}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {scheme === 'dark' ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="4.2" strokeWidth="1.6" />
            <path
              d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">
            <path
              d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="theme-toggle-text">{label}</span>
    </button>
  );
}
