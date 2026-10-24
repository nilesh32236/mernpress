import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';

afterEach(cleanup);

describe('admin placeholder', () => {
  it('renders the Phase 1 heading and a working skip link', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'MERNPress admin' })).toBeDefined();

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    expect(skipLink.getAttribute('href')).toBe('#main-content');
    expect(document.querySelector('#main-content')).not.toBeNull();
  });

  it('does not render authentication or content controls', () => {
    render(<App />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
