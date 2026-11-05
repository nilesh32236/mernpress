import { parseBlockMarkup } from './parser.js';
import type { ParsedBlock } from './contracts.js';

/**
 * Structural signature for "safe client editing".
 *
 * Two documents are structurally identical when they contain the same sequence
 * of block names, the same attributes and the same nesting. The inner HTML/text
 * is deliberately excluded so a client can rewrite copy without being able to
 * add, remove, reorder, nest or restyle blocks.
 */
function stableAttributes(attrs: Record<string, unknown>): string {
  const keys = Object.keys(attrs).sort();
  return JSON.stringify(keys.map((key) => [key, attrs[key]]));
}

function signatureOf(block: ParsedBlock): unknown {
  return [block.blockName, stableAttributes(block.attrs), block.innerBlocks.map(signatureOf)];
}

export function structureSignature(markup: string): string {
  return JSON.stringify(parseBlockMarkup(markup).map(signatureOf));
}

/** True when only text/innerHTML changed (or nothing changed). */
export function structureUnchanged(previous: string, next: string): boolean {
  return structureSignature(previous) === structureSignature(next);
}
