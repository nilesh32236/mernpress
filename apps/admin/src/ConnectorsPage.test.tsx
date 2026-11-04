import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorsPage } from './ConnectorsPage.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const base = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Text and image generation with GPT and DALL·E.',
    configured: false,
    maskedKey: null,
    updatedAt: null,
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Text and image generation with Gemini and Imagen.',
    configured: true,
    maskedKey: 'AIz…wxyz',
    updatedAt: '2026-11-04T09:00:00.000Z',
  },
];

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-token';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('connectors screen', () => {
  it('shows provider rows with connected state and masked key', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ items: base }));
    render(<ConnectorsPage />);

    expect(await screen.findByText('OpenAI')).toBeDefined();
    expect(screen.getByText('Google')).toBeDefined();
    expect(screen.getByText('Connected · key AIz…wxyz')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDefined();
    expect(screen.getByLabelText('OpenAI API key')).toBeDefined();
  });

  it('saves a key and disconnects a provider', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'PUT') {
        return response({
          items: base.map((item) =>
            item.id === 'openai' ? { ...item, configured: true, maskedKey: 'sk-…cdef' } : item,
          ),
        });
      }
      if (init?.method === 'DELETE') {
        return response({
          items: base.map((item) =>
            item.id === 'google' ? { ...item, configured: false, maskedKey: null } : item,
          ),
        });
      }
      return response({ items: base });
    });

    render(<ConnectorsPage />);
    await screen.findByText('OpenAI');
    fireEvent.change(screen.getByLabelText('OpenAI API key'), {
      target: { value: 'sk-test-1234567890abcdef' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Connect OpenAI' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/connectors/openai',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    expect(await screen.findByText('OpenAI credentials saved.')).toBeDefined();

    const googleRow = document.querySelector('[data-connector="google"]') as HTMLElement;
    fireEvent.click(
      Array.from(googleRow.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Disconnect',
      )!,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/connectors/google',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByText('Google disconnected.')).toBeDefined();
  });
});
