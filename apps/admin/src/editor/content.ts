import { createBlock, parse, serialize } from '@wordpress/blocks';
import type { Block } from '@wordpress/blocks';

/**
 * Serialization helpers shared by the editor screen and its tests.
 *
 * Canonical content is WordPress-compatible block markup. The official
 * serializer is the only writer: we never hand-build block comments.
 */

/** Thrown when stored markup cannot be parsed. Callers must not overwrite it. */
export class ContentParseError extends Error {
  constructor(message = 'The stored block markup could not be parsed.') {
    super(message);
    this.name = 'ContentParseError';
  }
}

/**
 * Blocks the editor can load. Empty content starts with one empty paragraph.
 *
 * A parse failure throws instead of returning a blank document: silently
 * substituting an empty paragraph means the first keystroke would save over
 * content the parser could not read.
 */
export function blocksFromContent(content: string): Array<Block<Record<string, unknown>>> {
  let parsed: Array<Block<Record<string, unknown>>>;
  try {
    parsed = parse(content) as Array<Block<Record<string, unknown>>>;
  } catch (error) {
    throw new ContentParseError(error instanceof Error ? error.message : undefined);
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
 *
 * "Blank" is strict: a paragraph carrying any block attribute (alignment,
 * colour, class…) or any inline HTML beyond `<br>` counts as authored, so a
 * media-only paragraph (`<img>`) is never dropped on save.
 */
export function isBlankBlocks(blocks: Array<Block<Record<string, unknown>>>): boolean {
  if (blocks.length === 0) {
    return true;
  }
  return blocks.every((block) => {
    if (block.name !== 'core/paragraph' || block.innerBlocks.length > 0) {
      return false;
    }
    // Parsed blocks are filled with defaults (paragraph `dropCap: false`), so
    // only a meaningful setting (alignment, colour, class, custom style) marks
    // the paragraph as authored.
    const meaningful = (value: unknown): boolean => {
      if (value === undefined || value === null || value === false || value === '') return false;
      if (typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>).length > 0;
      }
      return true;
    };
    const hasAuthoredAttribute = Object.entries(block.attributes).some(
      ([key, value]) => key !== 'content' && meaningful(value),
    );
    if (hasAuthoredAttribute) {
      return false;
    }
    const html = attributeHtml(block.attributes['content']);
    if (plainText(html) !== '') {
      return false;
    }
    // Text-free but marked up (image, embed, separator inside the paragraph):
    // keep it. `<br>` and entities are the only markup that stays blank.
    const withoutBreaks = html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, ' ');
    return !/<[a-z!/]/i.test(withoutBreaks);
  });
}

/**
 * Serialize editor blocks to canonical content. Blank documents become ''.
 * Serializer failures propagate: callers must not replace stored content with
 * an empty document just because serialization failed.
 */
export function serializeBlocks(blocks: Array<Block<Record<string, unknown>>>): string {
  if (isBlankBlocks(blocks)) {
    return '';
  }
  return serialize(blocks);
}

/**
 * Seed value for the editor's undo stack. Normalizing here means the first
 * no-op edit does not create a spurious history entry.
 */
export function historySeed(content: string): string {
  try {
    return serializeBlocks(blocksFromContent(content));
  } catch {
    return content;
  }
}
