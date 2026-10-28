import { createBlock, parse, serialize } from '@wordpress/blocks';
import type { Block } from '@wordpress/blocks';

/**
 * Serialization helpers shared by the editor screen and its tests.
 *
 * Canonical content is WordPress-compatible block markup. The official
 * serializer is the only writer: we never hand-build block comments.
 */

/** Blocks the editor can load. Empty content starts with one empty paragraph. */
export function blocksFromContent(content: string): Array<Block<Record<string, unknown>>> {
  let parsed: Array<Block<Record<string, unknown>>>;
  try {
    parsed = parse(content) as Array<Block<Record<string, unknown>>>;
  } catch {
    parsed = [];
  }
  if (parsed.length === 0) {
    return [createBlock('core/paragraph')];
  }
  return parsed;
}

function attributeHtml(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const rich = value as { toHTMLString?: () => string; toString?: () => string };
    if (typeof rich.toHTMLString === 'function') {
      return rich.toHTMLString();
    }
    if (typeof rich.toString === 'function' && rich.toString !== Object.prototype.toString) {
      return rich.toString();
    }
  }
  return '';
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * True when the document has no authored content. A single empty paragraph is
 * the editor's blank state, not content: serializing it would make a brand-new
 * post look dirty before the author typed anything.
 */
export function isBlankBlocks(blocks: Array<Block<Record<string, unknown>>>): boolean {
  if (blocks.length === 0) {
    return true;
  }
  return blocks.every((block) => {
    if (block.name !== 'core/paragraph' || block.innerBlocks.length > 0) {
      return false;
    }
    // Parsed paragraph content is a RichTextData object, not a plain string.
    return plainText(attributeHtml(block.attributes['content'])) === '';
  });
}

/** Serialize editor blocks to canonical content. Blank documents become ''. */
export function serializeBlocks(blocks: Array<Block<Record<string, unknown>>>): string {
  if (isBlankBlocks(blocks)) {
    return '';
  }
  try {
    return serialize(blocks);
  } catch {
    return '';
  }
}

/**
 * Seed value for the editor's undo stack. Normalizing here means the first
 * no-op edit does not create a spurious history entry.
 */
export function historySeed(content: string): string {
  return serializeBlocks(blocksFromContent(content));
}
