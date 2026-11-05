import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorsPage } from './ConnectorsPage.js';
import type { SpamGuardState } from './api.js';

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

const spamState: SpamGuardState = {
  settings: { enabled: true, spamThreshold: 6, moderationThreshold: 3 },
  stats: { spam: 4, pending: 2, spamLast7Days: 1 },
  engine: {
    id: 'local-heuristic',
    name: 'Bundled heuristic guard',
    description: 'Scores every comment locally. No comment data leaves this server.',
  },
  akismet: {
    available: false,
    reason: 'Akismet calls an external service and needs an account and API key.',
  },
};

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-token';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

function mockApi(overrides: { spamPut?: (body: unknown) => Response } = {}) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/admin/connectors/spam')) {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as SpamGuardState['settings'];
        return overrides.spamPut?.(body) ?? response({ ...spamState, settings: body });
      }
      return response(spamState);
    }
    if (url.includes('/api/admin/connectors/openai') && init?.method === 'PUT') {
      return response({
        items: base.map((item) =>
          item.id === 'openai' ? { ...item, configured: true, maskedKey: 'sk-…cdef' } : item,
        ),
      });
    }
    if (url.includes('/api/admin/connectors/google') && init?.method === 'DELETE') {
      return response({
        items: base.map((item) =>
          item.id === 'google' ? { ...item, configured: false, maskedKey: null } : item,
        ),
      });
    }
    return response({ items: base });
  });
}

describe('connectors screen', () => {
  it('shows provider rows with connected state and masked key', async () => {
    mockApi();
    render(<ConnectorsPage />);

    expect(await screen.findByText('OpenAI')).toBeDefined();
    expect(screen.getByText('Google')).toBeDefined();
    expect(screen.getByText('Connected · key AIz…wxyz')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDefined();
    expect(screen.getByLabelText('OpenAI API key')).toBeDefined();
  });

  it('shows the bundled spam guard with settings, stats and the Akismet limitation', async () => {
    mockApi();
    render(<ConnectorsPage />);

    expect(await screen.findByRole('heading', { name: 'Spam protection' })).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
    expect((screen.getByLabelText('Hold for moderation at score') as HTMLInputElement).value).toBe(
      '3',
    );
    expect((screen.getByLabelText('Mark as spam at score') as HTMLInputElement).value).toBe('6');
    expect(
      screen.getByText('4 in Spam · 2 awaiting moderation · 1 caught in the last 7 days'),
    ).toBeDefined();
    expect(screen.getByText('Akismet')).toBeDefined();
    expect(screen.getByText(/external service and needs an account/)).toBeDefined();
    expect(
      (screen.getByLabelText('Filter new comments with the bundled spam guard') as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('saves spam thresholds and rejects a moderation threshold above spam', async () => {
    mockApi();
    render(<ConnectorsPage />);
    await screen.findByRole('heading', { name: 'Spam protection' });

    fireEvent.change(screen.getByLabelText('Hold for moderation at score'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('Mark as spam at score'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save protection settings' }));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/admin/connectors/spam',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ enabled: true, spamThreshold: 8, moderationThreshold: 4 }),
        }),
      ),
    );
    expect(await screen.findByText('Spam protection settings saved.')).toBeDefined();

    // Server-side rejection surfaces in the notice area.
    mockApi({
      spamPut: () =>
        response(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'The moderation threshold cannot be higher than the spam threshold.',
            },
          },
          400,
        ),
    });
    fireEvent.change(screen.getByLabelText('Hold for moderation at score'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save protection settings' }));
    expect(
      await screen.findByText('The moderation threshold cannot be higher than the spam threshold.'),
    ).toBeDefined();

    // The client refuses an inverted pair before calling the API.
    const calls = vi.mocked(fetch).mock.calls.length;
    fireEvent.change(screen.getByLabelText('Hold for moderation at score'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save protection settings' }));
    expect(
      await screen.findByText('The moderation threshold cannot be higher than the spam threshold.'),
    ).toBeDefined();
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });

  it('saves a key and disconnects a provider', async () => {
    mockApi();
    const fetchMock = vi.mocked(fetch);

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
