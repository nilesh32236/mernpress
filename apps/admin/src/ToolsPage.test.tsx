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
      const url = String(input);
      if (url.includes('/api/admin/export')) return response('');
      if (url.includes('/api/users')) {
        return response({
          items: [
            {
              id: 'u2',
              username: 'author-b',
              email: null,
              displayName: 'Author B',
              role: 'author',
              status: 'active',
              twoFactorEnabled: false,
              postCount: 1,
              createdAt: '2026-10-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes('/api/admin/terms')) {
        return response({
          items: [
            {
              id: 'cat-1',
              taxonomy: 'category',
              name: 'News',
              slug: 'news',
              description: null,
              parentId: null,
              postCount: 1,
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
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
  it('sends author, category, date and status filters', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/admin/export')) return response('');
      if (url.includes('/api/users')) {
        return response({
          items: [
            {
              id: 'u2',
              username: 'author-b',
              email: null,
              displayName: 'Author B',
              role: 'author',
              status: 'active',
              twoFactorEnabled: false,
              postCount: 1,
              createdAt: '2026-10-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes('/api/admin/terms')) {
        return response({
          items: [
            {
              id: 'cat-1',
              taxonomy: 'category',
              name: 'News',
              slug: 'news',
              description: null,
              parentId: null,
              postCount: 1,
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
      return response({ database: 'ok', mediaWritable: true, schedulerEnabled: true });
    });

    render(<ToolsPage />);
    await screen.findByRole('heading', { name: 'Export' });
    fireEvent.click(screen.getByRole('radio', { name: 'Posts' }));

    await screen.findByRole('option', { name: 'Author B' });
    fireEvent.change(screen.getByLabelText('Authors'), { target: { value: 'u2' } });
    fireEvent.change(screen.getByLabelText('Categories'), { target: { value: 'cat-1' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'publish' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download Export File' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/export?content=posts&author=u2&startDate=2026-10-01&endDate=2026-10-31&status=publish&category=cat-1',
        expect.objectContaining({ credentials: 'include' }),
      ),
    );
  });

  it('rejects a reversed date range before calling the API', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/users') || url.includes('/api/admin/terms')) {
        return response({
          items: [],
          pagination: { page: 1, perPage: 100, total: 0, totalPages: 0 },
        });
      }
      return response({ database: 'ok', mediaWritable: true, schedulerEnabled: true });
    });

    render(<ToolsPage />);
    await screen.findByRole('heading', { name: 'Export' });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download Export File' }));

    expect(
      await screen.findByText('The start date must be on or before the end date.'),
    ).toBeDefined();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/admin/export'))).toBe(
      false,
    );
  });
});
