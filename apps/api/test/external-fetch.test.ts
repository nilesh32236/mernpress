import { describe, expect, it, vi } from 'vitest';
import { createExternalLinkFetcher, ExternalFetchError } from '@mernpress/cms-core';

describe('external link fetcher', () => {
  it('follows redirects with guard re-check and returns final status', async () => {
    const doRequest = vi.fn(async ({ path }: { path: string }) => {
      if (path === '/old') return { status: 301, location: '/new' };
      return { status: 200, location: null };
    });
    const fetcher = createExternalLinkFetcher({
      resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
      doRequest: doRequest as never,
    });
    const result = await fetcher.fetchExternal('https://example.com/old');
    expect(result).toEqual({ httpStatus: 200, redirects: 1 });
    expect(doRequest).toHaveBeenCalledTimes(2);
  });

  it('blocks private resolutions and non-default ports without fetching', async () => {
    const doRequest = vi.fn(async () => ({ status: 200, location: null }));
    const fetcher = createExternalLinkFetcher({
      resolveHost: async () => [{ address: '10.0.0.1', family: 4 }],
      doRequest: doRequest as never,
    });
    await expect(fetcher.fetchExternal('https://example.com/')).rejects.toBeInstanceOf(
      ExternalFetchError,
    );
    expect(doRequest).not.toHaveBeenCalled();

    const fetcher2 = createExternalLinkFetcher({
      resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
      doRequest: doRequest as never,
    });
    await expect(fetcher2.fetchExternal('https://example.com:8443/')).rejects.toMatchObject({
      reason: 'blocked',
    });
    await expect(fetcher2.fetchExternal('http://169.254.169.254/')).rejects.toMatchObject({
      reason: 'blocked',
    });
  });

  it('stops after 3 redirects', async () => {
    const fetcher = createExternalLinkFetcher({
      resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
      doRequest: (async () => ({ status: 301, location: '/loop' })) as never,
    });
    await expect(fetcher.fetchExternal('https://example.com/loop')).rejects.toMatchObject({
      reason: 'redirects',
    });
  });
});
