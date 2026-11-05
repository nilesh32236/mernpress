import { describe, expect, it } from 'vitest';
import {
  anchorSummary,
  blockHash,
  blockLabel,
  listBlockAnchors,
  resolveBlockAnchor,
} from './blockAnchors.js';

const MARKUP =
  '<!-- wp:paragraph --><p>First</p><!-- /wp:paragraph -->\n\n' +
  '<!-- wp:group --><div class="wp-block-group"><!-- wp:paragraph --><p>Nested</p><!-- /wp:paragraph --></div><!-- /wp:group -->\n\n' +
  '<!-- wp:heading --><h2>Third</h2><!-- /wp:heading -->';

describe('block anchors', () => {
  it('lists blocks in document order with nested paths and labels', () => {
    const anchors = listBlockAnchors(MARKUP);
    expect(anchors.map((anchor) => [anchor.name, anchor.path, anchor.label])).toEqual([
      ['core/paragraph', '0', 'Paragraph'],
      ['core/group', '1', 'Group'],
      ['core/paragraph', '1.0', 'Paragraph'],
      ['core/heading', '2', 'Heading'],
    ]);
    expect(anchors.every((anchor) => /^[0-9a-f]{16}$/.test(anchor.hash))).toBe(true);
    expect(blockLabel('core/list-item')).toBe('List item');
    expect(blockLabel('core/html')).toBe('HTML');
    expect(blockLabel('my-plugin/hero')).toBe('Hero');
    expect(anchorSummary(anchors[0]!)).toBe('Paragraph · block 0');
  });

  it('keeps hashes stable for equal blocks and changes them with content', () => {
    const [first] = listBlockAnchors(MARKUP);
    const [same] = listBlockAnchors('<!-- wp:paragraph --><p>First</p><!-- /wp:paragraph -->');
    expect(same!.hash).toBe(first!.hash);
    const [changed] = listBlockAnchors('<!-- wp:paragraph --><p>First!</p><!-- /wp:paragraph -->');
    expect(changed!.hash).not.toBe(first!.hash);
    expect(blockHash('core/paragraph', { a: 1, b: 2 }, '<p>x</p>')).toBe(
      blockHash('core/paragraph', { b: 2, a: 1 }, '<p>x</p>'),
    );
    expect(blockHash('core/paragraph', {}, '<p>x</p>')).toBe(
      blockHash('core/paragraph', {}, '\n<p>x</p>\n'),
    );
  });

  it('resolves exact, moved, changed and missing anchors', () => {
    const anchors = listBlockAnchors(MARKUP);
    const first = anchors[0]!;
    expect(resolveBlockAnchor(first, anchors)).toMatchObject({
      status: 'exact',
      anchor: { path: '0' },
    });

    // Swap the first paragraph with the heading: same hash, new path.
    const swapped = listBlockAnchors(
      '<!-- wp:heading --><h2>Third</h2><!-- /wp:heading -->\n\n' +
        '<!-- wp:paragraph --><p>First</p><!-- /wp:paragraph -->',
    );
    expect(resolveBlockAnchor(first, swapped)).toMatchObject({
      status: 'moved',
      anchor: { path: '1' },
    });

    // Edit the paragraph in place: same path, new hash.
    const edited = listBlockAnchors(
      '<!-- wp:paragraph --><p>First, edited.</p><!-- /wp:paragraph -->',
    );
    expect(resolveBlockAnchor(first, edited)).toMatchObject({
      status: 'changed',
      anchor: { path: '0' },
    });

    // Edited and moved at once: same name and similar text at another path.
    const editedAndMoved = listBlockAnchors(
      '<!-- wp:heading --><h2>Third</h2><!-- /wp:heading -->\n\n' +
        '<!-- wp:paragraph --><p>First, edited.</p><!-- /wp:paragraph -->',
    );
    expect(resolveBlockAnchor(first, editedAndMoved)).toMatchObject({
      status: 'changed',
      anchor: { path: '1' },
    });

    // Remove it entirely (a different block now sits at the old path).
    const removed = listBlockAnchors(
      '<!-- wp:heading --><h2>Third</h2><!-- /wp:heading -->\n\n' +
        '<!-- wp:paragraph --><p>Unrelated replacement.</p><!-- /wp:paragraph -->',
    );
    expect(resolveBlockAnchor(first, removed)).toEqual({ status: 'missing', anchor: null });
  });
});
