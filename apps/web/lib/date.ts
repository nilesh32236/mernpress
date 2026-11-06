const DEFAULT_LOCALE = 'en-US';

/**
 * A date locale comes from the theme strings (admin-editable), so it is
 * untrusted. Malformed tags fall back to en-US instead of throwing inside
 * `Intl` during a render.
 */
export function safeDateLocale(value: string | null | undefined): string {
  if (!value) return DEFAULT_LOCALE;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 35) return DEFAULT_LOCALE;
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(trimmed)) return DEFAULT_LOCALE;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([trimmed]).length > 0 ? trimmed : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** UTC long date for public pages; null for missing/invalid instants. */
export function formatPublicDate(
  iso: string | null | undefined,
  locale?: string | null,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  };
  try {
    return date.toLocaleDateString(safeDateLocale(locale), options);
  } catch {
    return date.toLocaleDateString(DEFAULT_LOCALE, options);
  }
}
