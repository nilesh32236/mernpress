import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectsPage } from './RedirectsPage.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const linkList = {
  links: [
    {
      id: 'l1',
      sourcePostId: 'p1',
      sourceTitle: 'Source post',
      sourceSlug: 'source-post',
      url: '/missing-link',
      normalizedPath: '/missing-link',
      kind: 'internal',
      status: 'broken',
      httpStatus: 404,
      redirectTo: null,
      checkedAt: '2026-11-05T00:00:00.000Z',
    },
  ],
  summary: {
    total: 1,
    ok: 0,
    broken: 1,
    redirect: 0,
    external: 0,
    sources: 1,
    lastCheckedAt: '2026-11-05T00:00:00.000Z',
  },
};

const list = {
  redirects: [
    {
      id: 'r1',
      fromPath: '/old-post',
      toPath: '/posts/new-post',
      statusCode: 301,
      hits: 4,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ],
  notFound: [
    {
      id: 'n1',
      path: '/missing-page',
      hits: 7,
      firstSeenAt: '2026-11-04T00:00:00.000Z',
      lastSeenAt: '2026-11-05T00:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('redirects page', () => {
  it('lists redirects and 404s and adds a redirect', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/admin/links')) {
        if (init?.method === 'POST') {
          return response(
            {
              job: {
                id: 'job-1',
                type: 'linkcheck.scan',
                payload: {},
                status: 'PENDING',
                priority: 0,
                attempts: 0,
                maxAttempts: 2,
                scheduledAt: '2026-11-06T00:00:00.000Z',
                lockedAt: null,
                lockedBy: null,
                startedAt: null,
                completedAt: null,
                lastError: null,
                createdAt: '2026-11-06T00:00:00.000Z',
                updatedAt: '2026-11-06T00:00:00.000Z',
              },
            },
            202,
          );
        }
        return response(linkList);
      }
      if (url.includes('/api/admin/jobs')) {
        return response({
          items: [],
          pagination: { page: 1, perPage: 1, total: 0, totalPages: 0 },
        });
      }
      if (init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { fromPath: string; toPath: string };
        return response({
          redirects: [
            ...list.redirects,
            {
              id: 'r2',
              fromPath: payload.fromPath,
              toPath: payload.toPath,
              statusCode: 301,
              hits: 0,
              createdAt: '2026-11-05T00:00:00.000Z',
              updatedAt: '2026-11-05T00:00:00.000Z',
            },
          ],
          notFound: list.notFound,
        });
      }
      return response(list);
    });

    render(<RedirectsPage />);
    expect(await screen.findByText('/old-post')).toBeDefined();
    expect(screen.getByText('/missing-page')).toBeDefined();
    expect(screen.getByText('Redirects (1)')).toBeDefined();
    expect(screen.getByText('404s (1)')).toBeDefined();

    fireEvent.change(screen.getByLabelText('From path'), {
      target: { value: '/legacy' },
    });
    fireEvent.change(screen.getByLabelText('To path or URL'), {
      target: { value: '/posts/current' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Redirect' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/redirects',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('/legacy')).toBeDefined();
    expect(screen.getByText('Redirect added.')).toBeDefined();
  });

  it('lists broken links, queues a check and prefills a redirect', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/admin/links/check') && init?.method === 'POST') {
        return response(
          {
            job: {
              id: 'job-1',
              type: 'linkcheck.scan',
              payload: {},
              status: 'PENDING',
              priority: 0,
              attempts: 0,
              maxAttempts: 2,
              scheduledAt: '2026-11-06T00:00:00.000Z',
              lockedAt: null,
              lockedBy: null,
              startedAt: null,
              completedAt: null,
              lastError: null,
              createdAt: '2026-11-06T00:00:00.000Z',
              updatedAt: '2026-11-06T00:00:00.000Z',
            },
          },
          202,
        );
      }
      if (url.includes('/api/admin/links')) return response(linkList);
      if (url.includes('/api/admin/jobs')) {
        return response({
          items: [],
          pagination: { page: 1, perPage: 1, total: 0, totalPages: 0 },
        });
      }
      return response(list);
    });

    render(<RedirectsPage />);
    expect(await screen.findByText('/missing-link')).toBeDefined();
    expect(screen.getByText(/Broken links \(1 broken/)).toBeDefined();
    expect(screen.getByText('Source post')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Check links now' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/links/check',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText(/Link check queued/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add redirect for /missing-link' }));
    expect((screen.getByLabelText('From path') as HTMLInputElement).value).toBe('/missing-link');
  });

  it('prefills the form from a 404 "Redirect" action', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/admin/links')) return response({ ...linkList, links: [] });
      if (url.includes('/api/admin/jobs')) {
        return response({
          items: [],
          pagination: { page: 1, perPage: 1, total: 0, totalPages: 0 },
        });
      }
      return response(list);
    });
    render(<RedirectsPage />);
    await screen.findByText('/missing-page');

    fireEvent.click(screen.getByRole('button', { name: 'Redirect' }));
    expect((screen.getByLabelText('From path') as HTMLInputElement).value).toBe('/missing-page');
  });
});
