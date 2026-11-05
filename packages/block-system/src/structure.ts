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
/**
 * Editor-note anchors are stored in `metadata.anchorId`. They are annotation
 * metadata, not structure: adding or changing one must not trip the lock, and a
 * locked post must still be able to record where a note points. Other metadata
 * keys (for example block bindings) remain structural.
 */
function comparableAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const metadata = attrs['metadata'];
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const rest = { ...(metadata as Record<string, unknown>) };
    delete rest['anchorId'];
    const copy = { ...attrs };
    if (Object.keys(rest).length === 0) {
      delete copy['metadata'];
    } else {
      copy['metadata'] = rest;
    }
    return copy;
  }
  return attrs;
}

function stableAttributes(attrs: Record<string, unknown>): string {
  const comparable = comparableAttributes(attrs);
  const keys = Object.keys(comparable).sort();
  return JSON.stringify(keys.map((key) => [key, comparable[key]]));
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
