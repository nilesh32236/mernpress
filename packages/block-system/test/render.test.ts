import { describe, expect, it } from 'vitest';
import { RENDER_VERSION, RenderError, renderBlockMarkup } from '../src/render/index.js';

/**
 * Golden rendering tests (ADR 0007 §6). Expected strings are pinned verbatim
 * so any sanitizer/parser upgrade that changes output fails loudly here and
 * is reviewed deliberately.
 */
describe('renderBlockMarkup — golden output per block', () => {
  it('renders a paragraph with inline formatting', () => {
    const markup =
      '<!-- wp:paragraph -->\n<p>Hello <strong>world</strong>.</p>\n<!-- /wp:paragraph -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toBe('\n<p>Hello <strong>world</strong>.</p>\n');
    expect(result.toc).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('renders an aligned paragraph (block-support classes preserved)', () => {
    const markup =
      '<!-- wp:paragraph {"align":"center"} -->\n<p class="has-text-align-center">Centered</p>\n<!-- /wp:paragraph -->';
    expect(renderBlockMarkup(markup).html).toBe(
      '\n<p class="has-text-align-center">Centered</p>\n',
    );
  });

  it('renders a heading with a derived anchor and TOC entry', () => {
    const markup =
      '<!-- wp:heading -->\n<h2 class="wp-block-heading">Getting Started</h2>\n<!-- /wp:heading -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toBe(
      '\n<h2 class="wp-block-heading" id="getting-started">Getting Started</h2>\n',
    );
    expect(result.toc).toEqual([{ level: 2, id: 'getting-started', text: 'Getting Started' }]);
  });

  it('honours an explicit anchor attribute over the derived slug', () => {
    const markup =
      '<!-- wp:heading {"anchor":"custom-id"} -->\n<h2 id="custom-id">Title</h2>\n<!-- /wp:heading -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toContain('id="custom-id"');
    expect(result.toc).toEqual([{ level: 2, id: 'custom-id', text: 'Title' }]);
  });

  it('de-duplicates derived heading ids deterministically', () => {
    const markup =
      '<!-- wp:heading -->\n<h2>Intro</h2>\n<!-- /wp:heading -->\n' +
      '<!-- wp:heading -->\n<h2>Intro</h2>\n<!-- /wp:heading -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toContain('id="intro"');
    expect(result.html).toContain('id="intro-2"');
    expect(result.toc.map((entry) => entry.id)).toEqual(['intro', 'intro-2']);
  });

  it('renders nested lists', () => {
    const markup =
      '<!-- wp:list -->\n<ul>\n<!-- wp:list-item -->\n<li>One</li>\n<!-- /wp:list-item -->\n' +
      '<!-- wp:list-item -->\n<li>Two<ul><li>Nested</li></ul></li>\n<!-- /wp:list-item -->\n</ul>\n<!-- /wp:list -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toContain('<li>One</li>');
    expect(result.html).toContain('<ul><li>Nested</li></ul>');
    expect(result.html).not.toContain('<!--');
  });

  it('renders a quote with citation', () => {
    const markup =
      '<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>Quote text</p><cite>Author</cite></blockquote>\n<!-- /wp:quote -->';
    expect(renderBlockMarkup(markup).html).toBe(
      '\n<blockquote class="wp-block-quote"><p>Quote text</p><cite>Author</cite></blockquote>\n',
    );
  });

  it('renders an image block with figure/figcaption', () => {
    const markup =
      '<!-- wp:image {"sizeSlug":"large"} -->\n<figure class="wp-block-image size-large"><img src="https://cdn.example.com/photo.jpg" alt="A photo" width="800" height="600"/><figcaption>A photo</figcaption></figure>\n<!-- /wp:image -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toContain(
      '<img src="https://cdn.example.com/photo.jpg" alt="A photo" width="800" height="600">',
    );
    expect(result.html).toContain('<figcaption>A photo</figcaption>');
  });

  it('renders nested group/columns/column without duplicating children', () => {
    const markup =
      '<!-- wp:group --><div class="wp-block-group">' +
      '<!-- wp:columns --><div class="wp-block-columns">' +
      '<!-- wp:column --><div class="wp-block-column">' +
      '<!-- wp:paragraph --><p>Nested</p><!-- /wp:paragraph -->' +
      '</div><!-- /wp:column -->' +
      '</div><!-- /wp:columns -->' +
      '</div><!-- /wp:group -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toBe(
      '<div class="wp-block-group"><div class="wp-block-columns"><div class="wp-block-column"><p>Nested</p></div></div></div>',
    );
    // Exactly one copy of the nested paragraph.
    expect(result.html.match(/Nested/g)).toHaveLength(1);
  });

  it('renders code and preformatted blocks', () => {
    const markup =
      '<!-- wp:code -->\n<pre class="wp-block-code"><code>const x = 1 &lt; 2;</code></pre>\n<!-- /wp:code -->';
    expect(renderBlockMarkup(markup).html).toBe(
      '\n<pre class="wp-block-code"><code>const x = 1 &lt; 2;</code></pre>\n',
    );
  });

  it('renders separator and spacer', () => {
    const markup =
      '<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->\n' +
      '<!-- wp:spacer {"height":"48px"} -->\n<div style="height:48px" aria-hidden="true" class="wp-block-spacer"></div>\n<!-- /wp:spacer -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).toContain('<hr class="wp-block-separator has-alpha-channel-opacity">');
    expect(result.html).toContain('style="height: 48px"');
  });
});

describe('renderBlockMarkup — unknown and freeform blocks', () => {
  it('renders an unknown block as its sanitized inner HTML', () => {
    const markup =
      '<!-- wp:acme/hero {"level":1} -->\n<section class="hero"><h1>Hi</h1></section>\n<!-- /wp:acme/hero -->';
    const result = renderBlockMarkup(markup);
    // Unknown markup is preserved (div/section unwrap per allowlist: section
    // is not in the MVP allowlist, so it unwraps but content survives).
    expect(result.html).toContain('<h1>Hi</h1>');
    expect(result.html).not.toContain('wp:acme');
  });

  it('renders freeform HTML (blockName null) sanitized', () => {
    const markup = '<p>Loose <em>freeform</em> content.</p><script>alert(1)</script>';
    const result = renderBlockMarkup(markup);
    expect(result.html).toBe('<p>Loose <em>freeform</em> content.</p>');
  });

  it('never leaks block comment delimiters into output', () => {
    const markup =
      '<!-- wp:paragraph -->\n<p>A</p>\n<!-- /wp:paragraph -->\n<!-- wp:unknown/thing -->\n<p>B</p>\n<!-- /wp:unknown/thing -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).not.toMatch(/<!--\s*\/?wp:/);
  });

  it('does not rewrite or drop unknown stored markup in the source (renderer is read-only)', () => {
    const markup = '<!-- wp:acme/hero -->\n<section>Keep me</section>\n<!-- /wp:acme/hero -->';
    renderBlockMarkup(markup);
    // renderBlockMarkup has no mutation path by design; re-parse proves the
    // input string is untouched.
    expect(markup).toContain('wp:acme/hero');
  });
});

describe('renderBlockMarkup — hostile content', () => {
  it('neutralizes XSS stored inside a paragraph block', () => {
    const markup =
      '<!-- wp:paragraph -->\n<p>Safe <img src=x onerror=alert(1)> <a href="javascript:alert(1)">link</a></p>\n<!-- /wp:paragraph -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).not.toContain('onerror');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).toContain('Safe');
  });

  it('neutralizes XSS inside unknown blocks (inner HTML is untrusted)', () => {
    const markup =
      '<!-- wp:acme/widget -->\n<div><script>alert(1)</script><p onclick="alert(2)">x</p></div>\n<!-- /wp:acme/widget -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('onclick');
    expect(result.html).toContain('<p>x</p>');
  });

  it('rejects content over the size ceiling before rendering', () => {
    const huge = `<p>${'x'.repeat(2_100_000)}</p>`;
    expect(() => renderBlockMarkup(huge)).toThrow(RenderError);
    try {
      renderBlockMarkup(huge);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('CONTENT_TOO_LARGE');
    }
  });

  it('rejects nesting beyond the depth ceiling', () => {
    const open = Array.from(
      { length: 25 },
      () => '<!-- wp:group --><div class="wp-block-group">',
    ).join('');
    const close = Array.from({ length: 25 }, () => '</div><!-- /wp:group -->').join('');
    expect(() => renderBlockMarkup(`${open}<p>deep</p>${close}`)).toThrow(RenderError);
  });

  it('handles malformed attribute JSON without executing anything', () => {
    const markup =
      '<!-- wp:paragraph {broken json -->\n<p onclick="alert(1)">x</p>\n<!-- /wp:paragraph -->';
    const result = renderBlockMarkup(markup);
    expect(result.html).not.toContain('onclick');
  });

  it('handles unclosed blocks without leaking delimiters', () => {
    const markup = '<!-- wp:paragraph -->\n<p>Unclosed block';
    const result = renderBlockMarkup(markup);
    expect(result.html).not.toContain('<!--');
    expect(result.html).toContain('Unclosed block');
  });
});

describe('renderBlockMarkup — determinism and metadata', () => {
  it('produces byte-identical output for identical input across calls', () => {
    const markup =
      '<!-- wp:heading -->\n<h2>Same</h2>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>Body</p>\n<!-- /wp:paragraph -->';
    const first = renderBlockMarkup(markup);
    const second = renderBlockMarkup(markup);
    expect(first.html).toBe(second.html);
    expect(first.toc).toEqual(second.toc);
  });

  it('exposes a render version for future cache invalidation', () => {
    expect(RENDER_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('renders an empty document to empty output', () => {
    expect(renderBlockMarkup('').html).toBe('');
    expect(renderBlockMarkup('').toc).toEqual([]);
  });
});
