import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGES,
  normalizeLanguageConfig,
  type LanguageConfig,
} from '@mernpress/contracts';
import { fetchLanguages } from './api.js';

/**
 * Enabled content languages, loaded once for the admin shell.
 *
 * The editor and the Languages screen both need the list. Loading it in the
 * shell keeps the editor independent (its tests and read-only routes do not
 * depend on a settings request) and avoids a second fetch when navigating.
 */
const LanguagesContext = createContext<LanguageConfig>(DEFAULT_LANGUAGES);

export function LanguagesProvider({ children }: { children: ReactNode }) {
  const [languages, setLanguages] = useState<LanguageConfig>(DEFAULT_LANGUAGES);

  useEffect(() => {
    let active = true;
    fetchLanguages()
      .then((config) => {
        if (active) setLanguages(normalizeLanguageConfig(config));
      })
      .catch(() => {
        // The default language remains usable when the request fails.
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => languages, [languages]);
  return <LanguagesContext.Provider value={value}>{children}</LanguagesContext.Provider>;
}

export function useLanguages(): LanguageConfig {
  return useContext(LanguagesContext);
}
