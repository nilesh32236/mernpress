/**
 * Internal asynchronous action/filter contract (ADR 0003, D-6).
 *
 * This is an internal extension point, not a public plugin SDK. Phase 9 owns the
 * public plugin runtime, manifest and discovery.
 *
 * Contract:
 * - A FILTER returns a transformed value. Filters run in series, awaited, in
 *   priority-ascending then stable-registration order. The transformed result is
 *   revalidated by the caller before persistence. A filter vetoes by throwing
 *   `HookRejectedError`.
 * - An ACTION is an event notification. Actions run only after the database
 *   transaction commits, never transform the committed result, and a rollback
 *   emits no action. A failing action is contained and logged, never reported as
 *   a failed write.
 *
 * Payloads are typed and contain no secrets, sessions, passwords, raw Prisma/DB
 * handles or HTTP requests.
 */

/** Thrown by a filter to veto the operation. Mapped to a 400 by the caller. */
export class HookRejectedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'HookRejectedError';
    this.reason = reason;
  }
}

export type ActionHandler<P> = (payload: P) => void | Promise<void>;
export type FilterHandler<V> = (value: V) => V | Promise<V>;

/** Minimal logger the registry uses to report contained action failures. */
export interface HookLogger {
  warn(message: string): void;
}

export interface HookRegistryOptions {
  logger?: HookLogger;
  /** Maximum re-entrant depth before the guard trips. Default 8. */
  maxDepth?: number;
}

export interface HookRegistry {
  addAction<K extends keyof ActionMap & string>(
    name: K,
    handler: ActionHandler<ActionMap[K]>,
    priority?: number,
  ): () => void;
  addFilter<K extends keyof FilterMap & string>(
    name: K,
    handler: FilterHandler<FilterMap[K]>,
    priority?: number,
  ): () => void;
  /** Run an action after commit. Failures are contained and logged, never thrown. */
  doAction<K extends keyof ActionMap & string>(name: K, payload: ActionMap[K]): Promise<void>;
  /** Apply filters in series and return the transformed value. Veto propagates. */
  applyFilters<K extends keyof FilterMap & string>(
    name: K,
    value: FilterMap[K],
  ): Promise<FilterMap[K]>;
  /** Remove every handler. */
  dispose(): void;
}

// ---- Typed hook maps. Extend here as new lifecycle points are added. ----

import type {
  PostActionPayload,
  PostFilterDraft,
  PostScheduledActionPayload,
  PostTermsActionPayload,
} from '../content/types.js';
import type { TermActionPayload, TermFilterDraft } from '../taxonomy/types.js';

export interface ActionMap {
  'content.post.created': PostActionPayload;
  'content.post.updated': PostActionPayload;
  'content.post.published': PostActionPayload;
  'content.post.unpublished': PostActionPayload;
  'content.post.trashed': PostActionPayload;
  'content.post.restored': PostActionPayload;
  'content.post.terms_updated': PostTermsActionPayload;
  'content.post.scheduled': PostScheduledActionPayload;
  'content.post.unscheduled': PostScheduledActionPayload;
  'taxonomy.term.created': TermActionPayload;
  'taxonomy.term.updated': TermActionPayload;
  'taxonomy.term.deleted': TermActionPayload;
  'taxonomy.terms.converted': {
    from: 'category' | 'tag';
    to: 'category' | 'tag';
    converted: number;
    created: number;
    movedPosts: number;
  };
}

export interface FilterMap {
  'content.post.create': PostFilterDraft;
  'content.post.update': PostFilterDraft;
  'taxonomy.term.create': TermFilterDraft;
  'taxonomy.term.update': TermFilterDraft;
}
