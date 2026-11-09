import { describe, expect, it, vi } from 'vitest';
import { logNotFound, resetNotFoundLog, shouldLogNotFound } from '../lib/not-found-log';

describe('not-found logging', () => {
  it('never logs the root or an empty path', () => {
    expect(shouldLogNotFound('/')).toBe(false);
    expect(shouldLogNotFound('')).toBe(false);
    expect(shouldLogNotFound(null)).toBe(false);
    expect(shouldLogNotFound('not-a-path')).toBe(false);
    expect(shouldLogNotFound('/missing')).toBe(true);
    expect(shouldLogNotFound('/posts/old-slug')).toBe(true);
  });

  it('posts only the path, once per path per session', async () => {
    resetNotFoundLog();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await logNotFound({ fetchImpl: fetchImpl as unknown as typeof fetch, pathname: '/gone' });
    await logNotFound({ fetchImpl: fetchImpl as unknown as typeof fetch, pathname: '/gone' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/public/not-found');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ path: '/gone' });
  });

  it('swallows network failures so the 404 page still renders', async () => {
    resetNotFoundLog();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(
      logNotFound({ fetchImpl: fetchImpl as unknown as typeof fetch, pathname: '/gone' }),
    ).resolves.toBeUndefined();
    // A failed attempt is not marked as logged, so a later navigation retries.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
