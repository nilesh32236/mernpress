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

describe('breadcrumbs', () => {
  it('renders parent crumbs as links and the current page as plain text', async () => {
    const { Breadcrumbs } = await import('./components.js');
    const { fireEvent } = await import('@testing-library/react');
    const clicked: string[] = [];
    render(
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Posts', to: '/posts' },
          { label: 'Edit' },
        ]}
        onNavigate={(to) => {
          clicked.push(to);
        }}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeDefined();
    // Parent crumbs are links; the current page is text with aria-current.
    expect(nav.querySelectorAll('a')).toHaveLength(2);
    const current = screen.getByText('Edit');
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');

    // Same-named nav and breadcrumb links must remain distinguishable:
    // exactly one "Posts" link lives inside the breadcrumb nav.
    const { within } = await import('@testing-library/react');
    expect(within(nav).getAllByRole('link', { name: 'Posts' })).toHaveLength(1);

    fireEvent.click(within(nav).getByRole('link', { name: 'Posts' }));
    expect(clicked).toEqual(['/posts']);
  });
});
