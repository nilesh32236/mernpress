import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap.js';

function Harness({
  onEscape,
  mediaQuery,
  openInitially = false,
}: {
  onEscape?: () => void;
  mediaQuery?: string;
  openInitially?: boolean;
}) {
  const [open, setOpen] = useState(openInitially);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, {
    ...(onEscape ? { onEscape: () => onEscape() } : {}),
    ...(mediaQuery ? { mediaQuery } : {}),
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open panel
      </button>
      {open ? (
        <div ref={panelRef} role="dialog" aria-label="Panel">
          <button type="button" onClick={() => setOpen(false)}>
            First
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Last
          </button>
        </div>
      ) : null}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useFocusTrap', () => {
  it('moves focus into the panel and restores it to the opener on close', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open panel' });
    opener.focus();
    fireEvent.click(opener);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));

    // Closing re-renders without the panel; focus returns to the opener.
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    expect(document.activeElement).toBe(opener);
  });

  it('wraps Tab at the end and Shift+Tab at the start', () => {
    render(<Harness openInitially />);
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('calls onEscape for Escape', () => {
    const onEscape = vi.fn();
    render(<Harness openInitially onEscape={onEscape} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not trap while the media query does not match', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(<Harness openInitially mediaQuery="(max-width: 1024px)" />);
    // Focus stays where it was (the harness did not steal it).
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'First' }));
  });
});
