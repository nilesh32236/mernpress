/**
 * Isomorphic block-content contracts (Phase 5).
 *
 * Canonical content is WordPress-compatible serialized block markup stored in
 * `posts.content` with `content_format = 'wp_block_html'` (ADR 0001, docs/
 * architecture/gutenberg-and-rendering.md). This module must stay free of Node
 * built-ins, React and database imports so both the API and the admin can use
 * it.
 */

export const CONTENT_FORMAT = 'wp_block_html';
export const CONTENT_FORMAT_VERSION = 1;

/** Absolute ceiling accepted by the API content schema (2 MB). */
export const MAX_CONTENT_LENGTH = 2_000_000;
/** Structural ceilings: hostile input must not be able to exhaust the parser. */
export const MAX_BLOCK_COUNT = 5_000;
export const MAX_BLOCK_DEPTH = 20;

/** Mirrors the official parser output shape, normalised for our validation. */
export interface ParsedBlock {
  blockName: string | null;
  attrs: Record<string, unknown>;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  innerContent: Array<string | null>;
}

export interface ContentStats {
  blockCount: number;
  maxDepth: number;
  freeformCount: number;
}

export type ContentIssueCode = 'CONTENT_TOO_LARGE' | 'TOO_MANY_BLOCKS' | 'BLOCK_NESTING_TOO_DEEP';

export interface ContentValidation {
  ok: boolean;
  code?: ContentIssueCode;
  message?: string;
  stats: ContentStats;
}

export function emptyContentStats(): ContentStats {
  return { blockCount: 0, maxDepth: 0, freeformCount: 0 };
}
