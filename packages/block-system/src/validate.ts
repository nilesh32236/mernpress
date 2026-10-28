import {
  MAX_BLOCK_COUNT,
  MAX_BLOCK_DEPTH,
  MAX_CONTENT_LENGTH,
  emptyContentStats,
  type ContentStats,
  type ContentValidation,
  type ParsedBlock,
} from './contracts.js';
import { parseBlockMarkup } from './parser.js';

/**
 * Walk a parsed tree iteratively. Hostile input can nest thousands of levels
 * deep, so recursion is not an option here.
 */
export function measureBlocks(blocks: ParsedBlock[]): ContentStats {
  const stats: ContentStats = emptyContentStats();
  if (blocks.length === 0) {
    return stats;
  }

  const stack: Array<{ block: ParsedBlock; depth: number }> = blocks.map((block) => ({
    block,
    depth: 1,
  }));

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) break;
    const { block, depth } = item;
    stats.blockCount += 1;
    if (block.blockName === null) {
      stats.freeformCount += 1;
    }
    if (depth > stats.maxDepth) {
      stats.maxDepth = depth;
    }
    for (const child of block.innerBlocks) {
      stack.push({ block: child, depth: depth + 1 });
    }
  }

  return stats;
}

/**
 * Structural validation for block markup before persistence.
 *
 * This is not a sanitizer and does not reject unknown blocks: freeform HTML and
 * unregistered block names are valid content and must be preserved. It enforces
 * only the ceilings that protect the parser/renderer from hostile input.
 */
export function validateBlockMarkup(markup: string): ContentValidation {
  if (markup.length > MAX_CONTENT_LENGTH) {
    return {
      ok: false,
      code: 'CONTENT_TOO_LARGE',
      message: `Content must be ${MAX_CONTENT_LENGTH.toLocaleString('en-US')} characters or fewer.`,
      stats: emptyContentStats(),
    };
  }

  const blocks = parseBlockMarkup(markup);
  const stats = measureBlocks(blocks);

  if (stats.blockCount > MAX_BLOCK_COUNT) {
    return {
      ok: false,
      code: 'TOO_MANY_BLOCKS',
      message: `Content contains more than ${MAX_BLOCK_COUNT.toLocaleString('en-US')} blocks.`,
      stats,
    };
  }

  if (stats.maxDepth > MAX_BLOCK_DEPTH) {
    return {
      ok: false,
      code: 'BLOCK_NESTING_TOO_DEEP',
      message: `Block nesting deeper than ${MAX_BLOCK_DEPTH} levels is not supported.`,
      stats,
    };
  }

  return { ok: true, stats };
}
