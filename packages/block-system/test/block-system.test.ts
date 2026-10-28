import { describe, expect, it } from 'vitest';
import { MAX_BLOCK_COUNT, MAX_BLOCK_DEPTH, MAX_CONTENT_LENGTH } from '../src/contracts.js';
import { parseBlockMarkup } from '../src/parser.js';
import { measureBlocks, validateBlockMarkup } from '../src/validate.js';

function nestedGroups(depth: number): string {
  const open = Array.from({ length: depth }, () => '<!-- wp:group --><div class="wp-block-group">');
  const close = Array.from({ length: depth }, () => '</div><!-- /wp:group -->');
  return `${open.join('')}<!-- wp:paragraph --><p>Deep</p><!-- /wp:paragraph -->${close.join('')}`;
}

describe('parseBlockMarkup', () => {
  it('parses a paragraph with attributes and inline formatting', () => {
    const markup =
      '<!-- wp:paragraph {"align":"center"} -->\n<p class="has-text-align-center">Hello <strong>world</strong>.</p>\n<!-- /wp:paragraph -->';

    const blocks = parseBlockMarkup(markup);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.blockName).toBe('core/paragraph');
    expect(blocks[0]?.attrs).toEqual({ align: 'center' });
    expect(blocks[0]?.innerHTML).toContain('<strong>world</strong>');
    // innerContent keeps the whitespace that surrounds the block's inner HTML.
    expect(blocks[0]?.innerContent.join('')).toContain(
      '<p class="has-text-align-center">Hello <strong>world</strong>.</p>',
    );
  });

  it('parses a nested group/columns/column/paragraph tree', () => {
    const markup =
      '<!-- wp:group --><div class="wp-block-group">' +
      '<!-- wp:columns --><div class="wp-block-columns">' +
      '<!-- wp:column --><div class="wp-block-column">' +
      '<!-- wp:paragraph --><p>Nested</p><!-- /wp:paragraph -->' +
      '</div><!-- /wp:column -->' +
      '</div><!-- /wp:columns -->' +
      '</div><!-- /wp:group -->';

    const blocks = parseBlockMarkup(markup);
    expect(blocks).toHaveLength(1);
    const group = blocks[0];
    expect(group?.blockName).toBe('core/group');
    expect(group?.innerBlocks).toHaveLength(1);
    const columns = group?.innerBlocks[0];
    expect(columns?.blockName).toBe('core/columns');
    const column = columns?.innerBlocks[0];
    expect(column?.blockName).toBe('core/column');
    expect(column?.innerBlocks[0]?.blockName).toBe('core/paragraph');
    expect(column?.innerBlocks[0]?.innerHTML).toBe('<p>Nested</p>');
  });

  it('keeps freeform HTML as a null-named block', () => {
    const blocks = parseBlockMarkup('<p>Plain HTML</p>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.blockName).toBeNull();
    expect(blocks[0]?.innerHTML).toBe('<p>Plain HTML</p>');
  });

  it('preserves unknown blocks and their attributes', () => {
    const markup =
      '<!-- wp:acme/widget {"count":3,"label":"Hi"} --><div class="acme">Hi</div><!-- /wp:acme/widget -->';
    const blocks = parseBlockMarkup(markup);
    expect(blocks[0]?.blockName).toBe('acme/widget');
    expect(blocks[0]?.attrs).toEqual({ count: 3, label: 'Hi' });
    expect(blocks[0]?.innerHTML).toBe('<div class="acme">Hi</div>');
  });

  it('parses void blocks', () => {
    const blocks = parseBlockMarkup('<!-- wp:separator {"className":"is-style-wide"} /-->');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.blockName).toBe('core/separator');
    expect(blocks[0]?.attrs).toEqual({ className: 'is-style-wide' });
    expect(blocks[0]?.innerBlocks).toEqual([]);
  });

  it('degrades malformed attribute JSON to an empty object without throwing', () => {
    const markup = '<!-- wp:paragraph {not json} --><p>x</p><!-- /wp:paragraph -->';
    const blocks = parseBlockMarkup(markup);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.blockName).toBe('core/paragraph');
    expect(blocks[0]?.attrs).toEqual({});
  });

  it('returns an empty tree for empty or non-string input', () => {
    expect(parseBlockMarkup('')).toEqual([]);
    // Defensive boundary: HTTP bodies are validated by Zod, but the parser is
    // also called from editor-facing helpers.
    expect(parseBlockMarkup(undefined as unknown as string)).toEqual([]);
  });

  it('represents inter-block whitespace as a freeform block so round trips stay lossless', () => {
    const markup =
      '<!-- wp:paragraph -->\n<p>Spacing matters</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:separator /-->';
    const blocks = parseBlockMarkup(markup);
    // The official parser emits whitespace-only freeform blocks between
    // comment-delimited blocks. They serialize back to the same bytes, so the
    // editor must keep (not silently drop) them.
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.blockName).toBe('core/paragraph');
    expect(blocks[1]?.blockName).toBeNull();
    expect(blocks[1]?.innerHTML).toBe('\n\n');
    expect(blocks[2]?.blockName).toBe('core/separator');
  });
});

describe('measureBlocks', () => {
  it('counts nested blocks and maximum depth iteratively', () => {
    const blocks = parseBlockMarkup(
      '<!-- wp:group --><div class="wp-block-group">' +
        '<!-- wp:paragraph --><p>A</p><!-- /wp:paragraph -->' +
        '<!-- wp:paragraph --><p>B</p><!-- /wp:paragraph -->' +
        '</div><!-- /wp:group -->',
    );
    expect(measureBlocks(blocks)).toEqual({ blockCount: 3, maxDepth: 2, freeformCount: 0 });
  });
});

describe('validateBlockMarkup', () => {
  it('accepts valid markup and reports stats', () => {
    const result = validateBlockMarkup('<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->');
    expect(result.ok).toBe(true);
    expect(result.stats).toEqual({ blockCount: 1, maxDepth: 1, freeformCount: 0 });
  });

  it('accepts exactly the maximum nesting depth', () => {
    const result = validateBlockMarkup(nestedGroups(MAX_BLOCK_DEPTH - 1));
    expect(result.ok).toBe(true);
    expect(result.stats.maxDepth).toBe(MAX_BLOCK_DEPTH);
  });

  it('rejects nesting beyond the maximum depth', () => {
    const result = validateBlockMarkup(nestedGroups(MAX_BLOCK_DEPTH));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BLOCK_NESTING_TOO_DEEP');
  });

  it('accepts exactly the maximum block count', () => {
    const markup = Array.from(
      { length: MAX_BLOCK_COUNT },
      () => '<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->',
    ).join('');
    const result = validateBlockMarkup(markup);
    expect(result.ok).toBe(true);
    expect(result.stats.blockCount).toBe(MAX_BLOCK_COUNT);
  });

  it('rejects content above the maximum block count', () => {
    const markup = Array.from(
      { length: MAX_BLOCK_COUNT + 1 },
      () => '<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->',
    ).join('');
    const result = validateBlockMarkup(markup);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('TOO_MANY_BLOCKS');
  });

  it('rejects oversized content before parsing', () => {
    const result = validateBlockMarkup('a'.repeat(MAX_CONTENT_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('CONTENT_TOO_LARGE');
  });
});
