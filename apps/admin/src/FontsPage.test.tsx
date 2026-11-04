import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FontsPage } from './FontsPage.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        active: 'mernpress',
        themes: [
          {
            id: 'mernpress',
            name: 'MERNPress',
            active: true,
            fonts: [
              { family: 'Manrope', weights: [300, 400, 600, 700], source: 'theme' },
              { family: 'System UI', weights: [400, 600], source: 'system' },
            ],
          },
        ],
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('fonts screen', () => {
  it('lists the active theme fonts with a live sample', async () => {
    render(<FontsPage />);
    expect(await screen.findByText('Manrope')).toBeDefined();
    expect(screen.getByText('System UI')).toBeDefined();
    expect(screen.getByText('4 of 4 active')).toBeDefined();
    expect(screen.getByText('The quick brown fox jumps over the lazy dog.')).toBeDefined();
    expect(screen.getByText('Bundled with the MERNPress theme.')).toBeDefined();
  });

  it('states that upload and provider install are unavailable', async () => {
    render(<FontsPage />);
    await screen.findByText('Manrope');
    fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    expect(screen.getByText(/Uploading font files is not enabled/)).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Install Fonts' }));
    expect(screen.getByText(/Installing fonts from a font provider is not enabled/)).toBeDefined();
  });
});
