import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteEditorPage } from './SiteEditorPage.js';
import type { AuthUser } from './api.js';

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function mockApi() {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('group=permalinks')) return response({ permalink_base: 'posts' });
    if (url.includes('type=post')) {
      return response({
        items: [
          {
            slug: 'welcome-to-mernpress',
            terms: { categories: [{ slug: 'news' }], tags: [{ slug: 'demo' }] },
          },
        ],
      });
    }
    if (url.includes('type=page')) return response({ items: [{ slug: 'about' }] });
    return response({ items: [] });
  });
}

describe('site editor', () => {
  it('lists the theme templates and previews the selected one', async () => {
    mockApi();
    render(<SiteEditorPage user={admin} />);

    expect(await screen.findByRole('button', { name: /Single Post/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /404 Page/ })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Single Post/ }));
    await waitFor(() => {
      const frame = document.querySelector('iframe');
      expect(frame?.getAttribute('src')).toContain('/posts/welcome-to-mernpress');
    });

    fireEvent.click(screen.getByRole('button', { name: /Category Archive/ }));
    await waitFor(() =>
      expect(document.querySelector('iframe')?.getAttribute('src')).toContain('/category/news'),
    );
  });

  it('explains panels that are not editable in code-defined templates', async () => {
    mockApi();
    render(<SiteEditorPage user={admin} />);
    await screen.findByRole('button', { name: /Styles/ });
    fireEvent.click(screen.getByRole('button', { name: /Styles/ }));
    expect(await screen.findByText(/Styles is not available in this build/)).toBeDefined();
  });
});
