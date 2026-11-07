import { checkExternalUrl, isPublicResolution } from '@mernpress/contracts';
import { lookup as dnsLookup } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Outbound external-link fetcher (ADR 0061, gated by `external_link_check`).
 *
 * The guard in contracts decides whether a URL may be fetched; this module
 * performs the fetch defensively:
 * - every hop re-enters `checkExternalUrl`,
 * - the host is resolved once with `dns.lookup({ all: true })` and every
 *   answer must be public (`isPublicResolution`),
 * - the TCP/TLS connection is pinned to that first answer via a custom
 *   `lookup` (no second resolve, so DNS rebinding cannot swap the target),
 *   with `servername` kept as the original hostname for TLS SNI/cert checks,
 * - 5s timeout, at most 3 redirects, HEAD with a `GET Range` fallback.
 *
 * Only the final status code is returned; bodies are never stored.
 */

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type ResolveHost = (hostname: string) => Promise<ResolvedAddress[]>;

export interface PinnedRequestInput {
  protocol: 'http:' | 'https:';
  host: string;
  servername?: string;
  port: number;
  path: string;
  method: 'HEAD' | 'GET';
  headers: Record<string, string>;
  lookup: unknown;
  timeoutMs: number;
}

export type DoPinnedRequest = (
  input: PinnedRequestInput,
) => Promise<{ status: number; location: string | null }>;

export class ExternalFetchError extends Error {
  readonly reason: 'blocked' | 'dns' | 'network' | 'timeout' | 'redirects' | 'http';
  constructor(
    reason: 'blocked' | 'dns' | 'network' | 'timeout' | 'redirects' | 'http',
    message: string,
  ) {
    super(message);
    this.name = 'ExternalFetchError';
    this.reason = reason;
  }
}

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

function defaultResolveHost(hostname: string): Promise<ResolvedAddress[]> {
  return new Promise((resolvePromise, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolvePromise(addresses as ResolvedAddress[]);
    });
  });
}

function pinnedLookup(first: ResolvedAddress) {
  return (
    _hostname: string,
    options: NodeJS.ErrnoException | null | unknown,
    callback?: (
      error: NodeJS.ErrnoException | null,
      address: string | null,
      family: number,
    ) => void,
  ) => {
    const done =
      typeof options === 'function'
        ? (options as (
            error: NodeJS.ErrnoException | null,
            address: string | null,
            family: number,
          ) => void)
        : callback;
    done?.(null, first.address, first.family);
  };
}

function defaultDoRequest(
  input: PinnedRequestInput,
): Promise<{ status: number; location: string | null }> {
  return new Promise((resolvePromise, reject) => {
    const transport = input.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(
      {
        protocol: input.protocol,
        host: input.host,
        ...(input.servername ? { servername: input.servername } : {}),
        port: input.port,
        path: input.path,
        method: input.method,
        headers: input.headers,
        lookup: input.lookup as never,
        timeout: input.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === 'string' ? res.headers.location : null;
        res.resume();
        res.on('end', () => resolvePromise({ status, location }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

export interface ExternalFetcherOptions {
  resolveHost?: ResolveHost | undefined;
  doRequest?: DoPinnedRequest | undefined;
  timeoutMs?: number | undefined;
  maxRedirects?: number | undefined;
}

export function createExternalLinkFetcher(options: ExternalFetcherOptions = {}) {
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const doRequest = options.doRequest ?? defaultDoRequest;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  async function fetchExternal(rawUrl: string): Promise<{ httpStatus: number; redirects: number }> {
    let current = rawUrl;
    let redirects = 0;
    while (true) {
      const verdict = checkExternalUrl(current);
      if (!verdict.allowed) {
        throw new ExternalFetchError('blocked', `URL blocked by SSRF guard (${verdict.reason}).`);
      }
      const url = new URL(current);
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      let resolved: ResolvedAddress[];
      try {
        resolved = await resolveHost(hostname);
      } catch {
        throw new ExternalFetchError('dns', 'Host could not be resolved.');
      }
      if (!isPublicResolution(resolved.map((entry) => entry.address))) {
        throw new ExternalFetchError('blocked', 'Host resolved to a private address.');
      }
      const first = resolved[0]!;
      const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
      const path = `${url.pathname || '/'}${url.search}`;
      const headers: Record<string, string> = {
        'User-Agent': 'MERNPress linkcheck/1.0',
        Accept: '*/*',
        Host: url.port ? `${hostname}:${url.port}` : hostname,
      };
      let outcome: { status: number; location: string | null };
      try {
        outcome = await doRequest({
          protocol: url.protocol as 'http:' | 'https:',
          host: first.address,
          ...(url.protocol === 'https:' ? { servername: hostname } : {}),
          port,
          path,
          method: 'HEAD',
          headers,
          lookup: pinnedLookup(first) as never,
          timeoutMs,
        });
        if (outcome.status === 405 || outcome.status === 501) {
          outcome = await doRequest({
            protocol: url.protocol as 'http:' | 'https:',
            host: first.address,
            ...(url.protocol === 'https:' ? { servername: hostname } : {}),
            port,
            path,
            method: 'GET',
            headers: { ...headers, Range: 'bytes=0-0' },
            lookup: pinnedLookup(first) as never,
            timeoutMs,
          });
        }
      } catch (error) {
        const timedOut =
          (error as { code?: string })?.code === 'ETIMEDOUT' ||
          /timed out|timeout/i.test(String(error));
        throw new ExternalFetchError(
          timedOut ? 'timeout' : 'network',
          'External host could not be reached.',
        );
      }
      if ([301, 302, 303, 307, 308].includes(outcome.status) && outcome.location) {
        redirects += 1;
        if (redirects > maxRedirects) {
          throw new ExternalFetchError('redirects', 'Too many redirects.');
        }
        current = new URL(outcome.location, current).toString();
        continue;
      }
      return { httpStatus: outcome.status, redirects };
    }
  }

  return { fetchExternal };
}

export type ExternalLinkFetcher = ReturnType<typeof createExternalLinkFetcher>;
