import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus inside a floating panel.
 *
 * Used by the attachment drawer and the editor settings panel when it floats
 * over the canvas (phones/tablets). On desktop the editor panel is an in-flow
 * column, so `mediaQuery` keeps the trap off there; otherwise Tab could never
 * leave the sidebar.
 *
 * Behaviour:
 * - moves focus into the panel (the first focusable child, else the panel),
 * - keeps Tab/Shift+Tab cycling inside it,
 * - Escape calls `onEscape` (when provided),
 * - restores focus to the element that opened the panel.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options: {
    onEscape?: (() => void) | undefined;
    /** Only trap while this media query matches (e.g. floating layouts). */
    mediaQuery?: string | undefined;
    /** Selector for the element that should receive initial focus. */
    initialFocus?: string | undefined;
  } = {},
): void {
  const { onEscape, mediaQuery, initialFocus } = options;
  // Callers pass inline arrow functions; keeping the latest callback in a ref
  // stops the effect from tearing down and re-running on every render (which
  // would restore focus to the opener mid-interaction).
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const panel: HTMLElement = container;
    const media =
      mediaQuery && typeof window.matchMedia === 'function' ? window.matchMedia(mediaQuery) : null;
    if (media && !media.matches) return undefined;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // `offsetParent` is null for every element under jsdom, so visibility is
    // approximated with the attributes that actually hide controls.
    const isVisible = (element: HTMLElement): boolean =>
      element.closest('[hidden]') === null && element.closest('[aria-hidden="true"]') === null;
    const focusables = (): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);

    const initial =
      (initialFocus ? container.querySelector<HTMLElement>(initialFocus) : null) ??
      focusables()[0] ??
      container;
    // The panel may still be transitioning from `display: none` when React
    // flushes this effect (the click that opened it also re-focuses its own
    // button), and focusing a hidden element is a silent no-op. Retry briefly
    // until focus actually lands inside the panel.
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const focusInitial = (): void => {
      initial.focus({ preventScroll: true });
      if (panel.contains(document.activeElement)) return;
      attempts += 1;
      if (attempts <= 6) retry = setTimeout(focusInitial, 50);
    };
    focusInitial();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;
      const inside = current instanceof Node && panel.contains(current);
      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      if (retry !== null) clearTimeout(retry);
      document.removeEventListener('keydown', onKeyDown);
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef, mediaQuery, initialFocus]);
}
