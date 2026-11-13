import { DARK_SCHEME, type ColorScheme } from './colorScheme.js';

interface ColorSchemeToggleProps {
  /** The palette in use (`dark` = the full dark admin theme). */
  scheme: ColorScheme;
  /** Called when the visitor asks for the other theme. */
  onToggle: () => void;
  /** True while the change is being saved. */
  busy?: boolean;
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8Z" />
    </svg>
  );
}

/**
 * Light/dark switch for the admin.
 *
 * The WordPress palettes (ADR 0044) only recolour the chrome; `dark` is a
 * MERNPress addition that darkens the whole admin. The button lives in the
 * admin bar next to the user menu, so the theme can be changed without a trip
 * to the profile screen.
 */
export default function ColorSchemeToggle({ scheme, onToggle, busy }: ColorSchemeToggleProps) {
  const isDark = scheme === DARK_SCHEME;
  const label = isDark ? 'Switch to the light admin theme' : 'Switch to the dark admin theme';
  return (
    <button
      type="button"
      className="admin-bar-scheme-toggle"
      onClick={onToggle}
      disabled={busy}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      data-testid="color-scheme-toggle"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
