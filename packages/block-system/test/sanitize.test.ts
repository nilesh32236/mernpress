import { describe, expect, it } from 'vitest';
import { sanitizeHtml, sanitizeStyleAttribute } from '../src/sanitize.js';

/**
 * XSS regression suite for the allowlist sanitizer (ADR 0007 §6). Payloads
 * cover the OWASP/cheat-sheet classes most relevant to stored block content.
 * Every assertion is on the sanitized string, never on thrown errors: the
 * sanitizer must fail closed to inert markup, not to exceptions.
 */
describe('sanitizeHtml — script and event-handler payloads', () => {
  it('drops <script> tags and their contents', () => {
    expect(sanitizeHtml('<p>Hello</p><script>alert(1)</script>')).toBe('<p>Hello</p>');
  });

  it('drops script contents even when obfuscated by case/whitespace', () => {
    expect(sanitizeHtml('<ScRiPt>alert(1)</ScRiPt>')).toBe('');
    expect(sanitizeHtml('<script\n>alert(1)</script\n>')).toBe('');
  });

  it('removes inline event handlers but keeps the element', () => {
    expect(sanitizeHtml('<img src="https://example.com/a.jpg" onerror="alert(1)" alt="a">')).toBe(
      '<img src="https://example.com/a.jpg" alt="a">',
    );
    expect(sanitizeHtml('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeHtml('<a href="https://example.com" onmouseover="alert(1)">x</a>')).toBe(
      '<a href="https://example.com" rel="external noopener nofollow">x</a>',
    );
  });

  it('drops <style> tags and their contents', () => {
    const out = sanitizeHtml('<p>x</p><style>body{display:none}</style>');
    expect(out).not.toContain('display:none');
    expect(out).toContain('<p>x</p>');
  });

  it('unwraps disallowed embed/iframe/object/form tags without keeping the element', () => {
    expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>')).toBe('');
    expect(sanitizeHtml('<object data="x.swf"></object>')).toBe('');
    expect(sanitizeHtml('<embed src="x.swf">')).toBe('');
    expect(sanitizeHtml('<form action="https://evil.example"><input name="q"></form>')).toBe('');
  });

  it('drops SVG and MathML trees entirely (no SVG in MVP, T-12)', () => {
    const out = sanitizeHtml(
      '<p>a</p><svg onload="alert(1)"><circle r="5"/></svg><math><mi>x</mi></math>',
    );
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('<circle');
    expect(out).not.toContain('onload');
  });
});

describe('sanitizeHtml — URL payloads', () => {
  it('strips javascript: URLs', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="  javascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('strips entity/whitespace-obfuscated javascript: URLs', () => {
    expect(sanitizeHtml('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="javascript&#58;alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('strips data: and vbscript: URLs, including data:image/svg', () => {
    expect(sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe(
      '<a>x</a>',
    );
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="a">')).toBe(
      '<img alt="a">',
    );
    expect(sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>')).toBe('<a>x</a>');
  });

  it('strips dangerous srcset entries', () => {
    const out = sanitizeHtml(
      '<img srcset="javascript:alert(1) 1x, https://example.com/a.jpg 2x" alt="a">',
    );
    expect(out).not.toContain('javascript:');
  });

  it('keeps http/https/mailto/tel and relative URLs', () => {
    expect(sanitizeHtml('<a href="https://example.com/p">x</a>')).toBe(
      '<a href="https://example.com/p" rel="external noopener nofollow">x</a>',
    );
    expect(sanitizeHtml('<a href="mailto:a@example.com">x</a>')).toBe(
      '<a href="mailto:a@example.com">x</a>',
    );
    expect(sanitizeHtml('<a href="tel:+15551234567">x</a>')).toBe(
      '<a href="tel:+15551234567">x</a>',
    );
    expect(sanitizeHtml('<a href="/about">x</a>')).toBe('<a href="/about">x</a>');
    expect(sanitizeHtml('<a href="#section">x</a>')).toBe('<a href="#section">x</a>');
  });
});

describe('sanitizeHtml — malformed and mutation payloads', () => {
  it('neutralizes malformed tag soup', () => {
    const out = sanitizeHtml('<p><b>bold<p>para</b>');
    expect(out).not.toContain('<script');
    expect(out).toContain('bold');
  });

  it('handles mXSS attempts via namespace confusion', () => {
    // Classic DOMPurify regression payloads; the real DOM parser must not
    // reinterpret these as live SVG/MathML.
    const payloads = [
      '<math><mtext><table><mglyph><style><img src onerror=alert(1)>',
      '<svg></p><style><a id="</style><img src onerror=alert(1)>">',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    ];
    for (const payload of payloads) {
      const out = sanitizeHtml(payload);
      // Inert residue (an emptied <img src="">) is acceptable; executable
      // residue (handlers, scripts, live URLs) is not.
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('src=x');
      expect(out).not.toContain('<script');
    }
  });

  it('unwraps unknown tags but preserves their text content', () => {
    expect(sanitizeHtml('<marquee>hello</marquee>')).toBe('hello');
    expect(sanitizeHtml('<foo-bar>custom</foo-bar>')).toBe('custom');
  });

  it('strips comments', () => {
    expect(sanitizeHtml('<p>a<!-- hidden --></p>')).toBe('<p>a</p>');
  });

  it('strips data-* attributes (tighter than the reference allowlist)', () => {
    expect(sanitizeHtml('<p data-evil="x" data-safe="y">a</p>')).toBe('<p>a</p>');
  });

  it('strips template and base tags', () => {
    expect(sanitizeHtml('<template><img src=x onerror=alert(1)></template>')).toBe('');
    expect(sanitizeHtml('<base href="https://evil.example/">')).toBe('');
  });
});

describe('sanitizeHtml — style attribute policy', () => {
  it('keeps allowlisted block-support properties', () => {
    expect(
      sanitizeHtml('<p style="color: rgb(255, 0, 0); text-align: center; font-size: 20px">x</p>'),
    ).toBe('<p style="color: rgb(255, 0, 0); text-align: center; font-size: 20px">x</p>');
  });

  it('keeps gradient backgrounds (block background support)', () => {
    const out = sanitizeHtml(
      '<span style="background: linear-gradient(135deg, rgb(6,147,227) 0%, rgb(155,81,224) 100%)">x</span>',
    );
    expect(out).toContain('linear-gradient');
  });

  it('drops positioning/overlay properties (UI-redress defense)', () => {
    expect(sanitizeStyleAttribute('position: fixed; inset: 0; z-index: 9999; color: red')).toBe(
      'color: red',
    );
    expect(sanitizeStyleAttribute('transform: rotate(45deg); filter: blur(2px); margin: 4px')).toBe(
      'margin: 4px',
    );
    expect(sanitizeStyleAttribute('cursor: crosshair; pointer-events: none; padding: 2px')).toBe(
      'padding: 2px',
    );
  });

  it('drops url()/expression()/import values', () => {
    expect(sanitizeStyleAttribute('background-image: url(https://evil.example/x)')).toBe('');
    expect(sanitizeStyleAttribute('width: expression(alert(1))')).toBe('');
    expect(sanitizeStyleAttribute('background: url(javascript:alert(1))')).toBe('');
    expect(sanitizeStyleAttribute('@import url(https://evil.example); color: blue')).toBe(
      'color: blue',
    );
  });

  it('collapses a fully-rejected style attribute to empty', () => {
    expect(sanitizeHtml('<p style="position: fixed; behavior: url(x)">x</p>')).toBe(
      '<p style="">x</p>',
    );
  });
});

describe('sanitizeHtml — allowed MVP markup survives intact', () => {
  it('keeps core block markup with classes, anchors and ARIA', () => {
    const input =
      '<figure class="wp-block-image size-large"><img src="https://cdn.example.com/a.webp" alt="Alt" width="1024" height="768" loading="lazy" decoding="async"/><figcaption class="wp-element-caption">Cap</figcaption></figure>';
    expect(sanitizeHtml(input)).toBe(
      '<figure class="wp-block-image size-large"><img src="https://cdn.example.com/a.webp" alt="Alt" width="1024" height="768" loading="lazy" decoding="async"><figcaption class="wp-element-caption">Cap</figcaption></figure>',
    );
  });

  it('keeps typographic inline markup', () => {
    const input =
      '<p><strong>b</strong> <em>i</em> <mark class="has-inline-color">m</mark> <kbd>Ctrl</kbd> H<sub>2</sub>O x<sup>2</sup> <code>c()</code></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('keeps list structure with start/reversed/type', () => {
    // jsdom serializes boolean attributes in the explicit `name=""` form.
    expect(sanitizeHtml('<ol start="4" reversed type="a"><li>one</li><li>two</li></ol>')).toBe(
      '<ol start="4" reversed="" type="a"><li>one</li><li>two</li></ol>',
    );
  });

  it('keeps quote/cite and code/pre blocks', () => {
    expect(
      sanitizeHtml(
        '<blockquote class="wp-block-quote"><p>Q</p><cite>C</cite></blockquote><pre class="wp-block-code"><code>const a = 1;</code></pre>',
      ),
    ).toBe(
      '<blockquote class="wp-block-quote"><p>Q</p><cite>C</cite></blockquote><pre class="wp-block-code"><code>const a = 1;</code></pre>',
    );
  });
});

describe('sanitizeHtml — external link rel hardening', () => {
  it('adds external noopener nofollow to absolute http(s) links', () => {
    expect(sanitizeHtml('<a href="http://example.com/">x</a>')).toContain(
      'rel="external noopener nofollow"',
    );
  });

  it('merges with existing rel tokens without duplicating', () => {
    const out = sanitizeHtml('<a href="https://example.com/" rel="sponsored noopener">x</a>');
    expect(out).toContain('rel="sponsored noopener external nofollow"');
  });

  it('leaves relative, fragment, mailto and tel links untouched', () => {
    expect(sanitizeHtml('<a href="/about">x</a>')).toBe('<a href="/about">x</a>');
    expect(sanitizeHtml('<a href="#s">x</a>')).toBe('<a href="#s">x</a>');
    expect(sanitizeHtml('<a href="mailto:a@b.c">x</a>')).toBe('<a href="mailto:a@b.c">x</a>');
  });
});
