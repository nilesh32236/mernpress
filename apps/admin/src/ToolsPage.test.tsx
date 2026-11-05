import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolsPage } from './ToolsPage.js';

function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    blob: async () => new Blob(['<rss></rss>'], { type: 'application/rss+xml' }),
  } as Response;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/tools?section=export');
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:export'),
    revokeObjectURL: vi.fn(),
  });
  // jsdom does not implement scrolling or blob-download navigation.
  Element.prototype.scrollIntoView = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('tools export screen', () => {
  it('downloads a WXR file for the selected scope', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes('/api/admin/export')) return response('');
      return response({ database: 'ok', mediaWritable: true, schedulerEnabled: true });
    });

    render(<ToolsPage />);

    expect(await screen.findByRole('heading', { name: 'Export' })).toBeDefined();
    expect(screen.getByText(/WordPress eXtended RSS or WXR/)).toBeDefined();
    expect((screen.getByRole('radio', { name: 'All content' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByRole('radio', { name: 'Posts' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Pages' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Media' })).toBeDefined();

    fireEvent.click(screen.getByRole('radio', { name: 'Posts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Export File' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/export?content=posts',
        expect.objectContaining({ credentials: 'include' }),
      ),
    );
    expect(await screen.findByText('Export file downloaded.')).toBeDefined();
  });
});
