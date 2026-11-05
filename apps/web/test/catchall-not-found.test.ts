import { afterEach, describe, expect, it, vi } from 'vitest';
import CatchAllNotFound from '../app/[...path]/page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catch-all 404 logger', () => {
  it('records the path once and renders the 404 page', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      CatchAllNotFound({ params: Promise.resolve({ path: ['ghost', 'deep'] }) }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/not-found'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: '/ghost/deep' }),
      }),
    );
  });

  it('does not fail the 404 page when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(
      CatchAllNotFound({ params: Promise.resolve({ path: ['gone'] }) }),
    ).rejects.toThrow();
  });
});
