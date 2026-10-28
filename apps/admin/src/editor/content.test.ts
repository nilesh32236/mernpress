import { beforeAll, describe, expect, it } from 'vitest';
import { ensureEditorBootstrap } from './blocks.js';
import { blocksFromContent, historySeed, isBlankBlocks, serializeBlocks } from './content.js';

// The official parser/creator needs the core block types registered, exactly
// as the real editor does at bootstrap.
beforeAll(() => {
  ensureEditorBootstrap();
});

describe('editor content serialization', () => {
  it('starts empty content with a single empty paragraph', () => {
    const blocks = blocksFromContent('');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.name).toBe('core/paragraph');
    expect(serializeBlocks(blocks)).toBe('');
    expect(isBlankBlocks(blocks)).toBe(true);
  });

  it('serializes a paragraph through the official serializer', () => {
    const content =
      '<!-- wp:paragraph -->\n<p>Hello <strong>world</strong>.</p>\n<!-- /wp:paragraph -->';
    const blocks = blocksFromContent(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.name).toBe('core/paragraph');

    const serialized = serializeBlocks(blocks);
    expect(serialized).toContain('<!-- wp:paragraph -->');
    expect(serialized).toContain('<p>Hello <strong>world</strong>.</p>');
    expect(serialized).toContain('<!-- /wp:paragraph -->');
  });

  it('round-trips a nested list with attributes', () => {
    const content = [
      '<!-- wp:list {"ordered":true} -->',
      '<ol class="wp-block-list">',
      '<!-- wp:list-item -->',
      '<li>First</li>',
      '<!-- /wp:list-item -->',
      '<!-- wp:list-item -->',
      '<li>Second</li>',
      '<!-- /wp:list-item -->',
      '</ol>',
      '<!-- /wp:list -->',
    ].join('\n');

    const once = serializeBlocks(blocksFromContent(content));
    const twice = serializeBlocks(blocksFromContent(once));
    expect(twice).toBe(once);
    expect(once).toContain('<li>First</li>');
    expect(once).toContain('"ordered":true');
  });

  it('round-trips heading and separator blocks', () => {
    const content = [
      '<!-- wp:heading {"level":2} -->',
      '<h2 class="wp-block-heading">Title</h2>',
      '<!-- /wp:heading -->',
      '',
      '<!-- wp:separator -->',
      '<hr class="wp-block-separator has-alpha-channel-opacity"/>',
      '<!-- /wp:separator -->',
    ].join('\n');

    const once = serializeBlocks(blocksFromContent(content));
    const twice = serializeBlocks(blocksFromContent(once));
    expect(twice).toBe(once);
    expect(once).toContain('<h2 class="wp-block-heading">Title</h2>');
    expect(once).toContain('<hr class="wp-block-separator has-alpha-channel-opacity"/>');
  });

  it('keeps unknown blocks instead of dropping them', () => {
    const content =
      '<!-- wp:acme/widget {"count":3} --><div class="acme">Hi</div><!-- /wp:acme/widget -->';
    const serialized = serializeBlocks(blocksFromContent(content));
    expect(serialized).toContain('wp:acme/widget');
    expect(serialized).toContain('<div class="acme">Hi</div>');
  });

  it('preserves legacy freeform HTML', () => {
    const serialized = serializeBlocks(blocksFromContent('<p>Plain HTML</p>'));
    expect(serialized).toContain('<p>Plain HTML</p>');
  });

  it('treats a whitespace-only paragraph as blank and drops it on serialize', () => {
    const content = '<!-- wp:paragraph -->\n<p>&nbsp;</p>\n<!-- /wp:paragraph -->';
    const blocks = blocksFromContent(content);
    expect(isBlankBlocks(blocks)).toBe(true);
    expect(serializeBlocks(blocks)).toBe('');
  });

  it('seeds history with normalized content and is stable', () => {
    const content = '<!-- wp:paragraph -->\n<p>Seed</p>\n<!-- /wp:paragraph -->';
    const seed = historySeed(content);
    expect(historySeed(seed)).toBe(seed);
  });
});
