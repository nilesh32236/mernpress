import { useEffect } from 'react';

/**
 * Locks document scrolling while an overlay is open.
 *
 * `mediaQuery` limits the lock to the viewport sizes where the overlay really
 * floats over the page: the off-canvas menu and the editor settings panel are
 * in-flow columns on desktop, so locking there would leave a dead scrollbar.
 */
export function useBodyScrollLock(active: boolean, mediaQuery?: string): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const media =
      mediaQuery && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(mediaQuery)
        : null;
    if (media && !media.matches) {
      return undefined;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const sync = (): void => {
      document.body.style.overflow = !media || media.matches ? 'hidden' : previous;
    };
    if (media && typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
    }

    return () => {
      if (media && typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', sync);
      }
      document.body.style.overflow = previous;
    };
  }, [active, mediaQuery]);
}
