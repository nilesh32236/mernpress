import type { HookRegistry } from '@mernpress/cms-core';

export interface RevalidatorOptions {
  /** Private web origin + path, e.g. http://127.0.0.1:3100/api/revalidate. */
  url?: string | undefined;
  secret?: string | undefined;
  /** Cache tag the web app exposes; must match its allowlist. */
  tag?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  logger?: { warn(meta: Record<string, unknown>, message: string): void } | undefined;
  /** Request timeout; a slow web process must never hold a content commit. */
  timeoutMs?: number | undefined;
}

export type Revalidator = (reason: string) => void;

/**
 * Public-cache invalidation webhook (ADR 0056).
 *
 * The web app caches public list/term responses for 60 s under the
 * `public-content` tag. After a content or taxonomy commit the API pings the
 * private web origin so the next visitor sees the change. The call is
 * fire-and-forget: a web outage must not fail an editorial save, and the 60 s
 * window is the safety net if a notification is lost.
 */
export function createRevalidator(options: RevalidatorOptions = {}): Revalidator {
  const {
    url,
    secret,
    tag = 'public-content',
    fetchImpl = fetch,
    logger,
    timeoutMs = 3000,
  } = options;

  if (!url || !secret || secret.length < 16) {
    return (reason: string) => {
      if (reason.length > 0) return;
    };
  }

  return (reason: string): void => {
    const run = async (): Promise<void> => {
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-revalidate-secret': secret,
          },
          body: JSON.stringify({ tags: [tag] }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          logger?.warn(
            { status: response.status, reason },
            'public cache revalidation was rejected',
          );
        }
      } catch (error) {
        logger?.warn(
          { reason, err: error instanceof Error ? error.message : String(error) },
          'public cache revalidation failed',
        );
      }
    };
    void run();
  };
}

/** Content/taxonomy actions that change what the public site renders. */
export const REVALIDATE_ACTIONS = [
  'content.post.created',
  'content.post.updated',
  'content.post.published',
  'content.post.unpublished',
  'content.post.trashed',
  'content.post.restored',
  'content.post.terms_updated',
  'content.post.scheduled',
  'content.post.unscheduled',
  'taxonomy.term.created',
  'taxonomy.term.updated',
  'taxonomy.term.deleted',
  'taxonomy.terms.converted',
] as const;

/**
 * Subscribe the revalidator to every public-content action. Failures are
 * contained by the hook registry, so this never breaks a write.
 */
export function registerRevalidation(hooks: HookRegistry, revalidate: Revalidator): void {
  for (const action of REVALIDATE_ACTIONS) {
    hooks.addAction(action, () => {
      revalidate(action);
    });
  }
}
