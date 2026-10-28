import { parse } from '@wordpress/block-serialization-default-parser';
import type { ParsedBlock } from './contracts.js';

interface RawBlock {
  blockName?: string | null;
  attrs?: unknown;
  innerBlocks?: RawBlock[];
  innerHTML?: string;
  innerContent?: Array<string | null>;
}

function normalizeAttrs(attrs: unknown): Record<string, unknown> {
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    return attrs as Record<string, unknown>;
  }
  // The parser represents missing/malformed attribute JSON as null. Keep it as
  // an empty object so callers never need to branch; the original markup is
  // still preserved byte-for-byte by the editor/serializer contract.
  return {};
}

function normalizeBlock(raw: RawBlock): ParsedBlock {
  const innerBlocks = Array.isArray(raw.innerBlocks) ? raw.innerBlocks.map(normalizeBlock) : [];
  return {
    blockName: typeof raw.blockName === 'string' ? raw.blockName : null,
    attrs: normalizeAttrs(raw.attrs),
    innerBlocks,
    innerHTML: typeof raw.innerHTML === 'string' ? raw.innerHTML : '',
    innerContent: Array.isArray(raw.innerContent) ? raw.innerContent : [],
  };
}

/**
 * Parse WordPress-compatible block markup into a normalised tree.
 *
 * The official parser is deliberately tolerant: freeform HTML becomes a block
 * with `blockName: null`, and malformed attribute JSON degrades to `{}`. We do
 * not rewrite or reject content here; structural limits are enforced by
 * `validateBlockMarkup`.
 */
export function parseBlockMarkup(markup: string): ParsedBlock[] {
  if (typeof markup !== 'string' || markup.length === 0) {
    return [];
  }
  const parsed = parse(markup) as RawBlock[];
  return Array.isArray(parsed) ? parsed.map(normalizeBlock) : [];
}
