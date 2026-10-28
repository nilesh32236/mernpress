import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Skeleton } from './components.js';

afterEach(() => {
  cleanup();
});

describe('skeleton loading state', () => {
  it('renders an accessible busy status', () => {
    render(<Skeleton label="Loading content…" lines={3} />);
    const skeleton = screen.getByRole('status');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(skeleton.className).toContain('skeleton');
    expect(skeleton.querySelectorAll('.skeleton-line').length).toBe(3);
  });
});
