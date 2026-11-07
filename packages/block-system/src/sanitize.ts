import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Server-side allowlist HTML sanitizer (ADR 0007).
 *
 * Node-only: pulls in jsdom and must never be reachable from the isomorphic
 * contracts/parser/validate entrypoints or the admin bundle.
 *
 * The allowlist covers exactly the MVP block set
 * (docs/architecture/gutenberg-and-rendering.md §6). It is deliberately
 * tighter than the reference CMS's list: no SVG, no forms, no tables, no
 * `data-*`. Anything not listed is unwrapped (text kept); script/style
 * contents are dropped by DOMPurify itself.
 */

export const ALLOWED_TAGS: readonly string[] = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'span',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'cite',
  'figure',
  'figcaption',
  'img',
  'code',
  'pre',
  'hr',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'sub',
  'sup',
  'kbd',
  'small',
  'button',
];

export const ALLOWED_ATTR: readonly string[] = [
  'id',
  'class',
  'href',
  'target',
  'rel',
  'src',
  'srcset',
  'sizes',
  'alt',
  'title',
  'width',
  'height',
  'loading',
  'decoding',
  'style',
  'role',
  'start',
  'type',
  'reversed',
  'lang',
  'dir',
  'aria-hidden',
  'aria-label',
  'aria-describedby',
  'aria-current',
];

/**
 * Only `http(s)`, `mailto:` and `tel:` plus scheme-less (relative/fragment)
 * URLs. `javascript:`, `data:`, `vbscript:`, `file:`, `ftp:` and
 * protocol-relative scheme tricks are rejected; DOMPurify drops the whole
 * attribute when the value fails the expression.
 */
export const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * CSS properties emitted by the editor's block supports (colors, spacing,
 * typography, layout primitives). Anything else — notably positioning,
 * stacking, transforms, filters and cursors — is removed so a style
 * attribute cannot be used for UI-redress/overlay attacks on public pages.
 */
const ALLOWED_CSS_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'border',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'height',
  'min-height',
  'max-height',
  'width',
  'min-width',
  'max-width',
  'flex-basis',
  'flex-grow',
  'flex-shrink',
  'gap',
  'row-gap',
  'column-gap',
  'justify-content',
  'align-items',
  'align-self',
  'vertical-align',
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-color',
  'text-transform',
  'font-size',
  'font-style',
  'font-weight',
  'font-family',
  'line-height',
  'letter-spacing',
  'white-space',
  'word-break',
  'overflow-wrap',
  'opacity',
  'box-shadow',
]);

/**
 * Gradient backgrounds are a block-support feature and safe (no URL fetch).
 * Any other functional value that could reference an external or scripted
 * resource is rejected.
 */
const SAFE_CSS_FUNCTION = /^(?:linear|radial|conic)-gradient\(/i;
const FORBIDDEN_CSS_VALUE =
  /url\s*\(|expression\s*\(|@|import|behavior\s*:|-moz-binding|javascript:|vbscript:|data:/i;

/**
 * Sanitize one inline `style` attribute value against the property allowlist.
 * Returns the rebuilt declaration string, or an empty string when nothing
 * safe remains (the attribute is then dropped entirely).
 */
export function sanitizeStyleAttribute(value: string): string {
  const kept: string[] = [];
  for (const declaration of value.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const rawValue = declaration.slice(colon + 1).trim();
    if (!ALLOWED_CSS_PROPERTIES.has(property) || rawValue.length === 0) {
      continue;
    }
    if (FORBIDDEN_CSS_VALUE.test(rawValue)) {
      continue;
    }
    if (
      /[a-z-]+\(/i.test(rawValue) &&
      !SAFE_CSS_FUNCTION.test(rawValue) &&
      !isPlainCssFunction(rawValue)
    ) {
      continue;
    }
    kept.push(`${property}: ${rawValue}`);
  }
  return kept.join('; ');
}

/**
 * Plain value-level functions that carry no URL/script risk and appear in
 * block-support output (color mixing, sizing).
 */
const PLAIN_CSS_FUNCTION =
  /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|calc|min|max|clamp|var)\(/i;

function isPlainCssFunction(value: string): boolean {
  return PLAIN_CSS_FUNCTION.test(value);
}

interface PurifyAttributeEvent {
  attrName: string;
  attrValue: unknown;
  keepAttr: boolean;
  forceKeepAttr: boolean | undefined;
}

interface PurifyWindow {
  sanitize: (dirty: string, config: Record<string, unknown>) => string;
  addHook: (name: string, fn: (node: unknown, data: PurifyAttributeEvent) => void) => void;
}

function createPurify(): PurifyWindow {
  const window = new JSDOM('').window;
  const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
  // External links get rel="external noopener nofollow" at render time
  // (WordPress link blocks do the same for outbound URLs). Relative and
  // mailto/tel links are untouched; existing rel tokens are preserved.
  purify.addHook('uponSanitizeElement', (node: unknown) => {
    const el = node as {
      tagName?: string;
      getAttribute?: (name: string) => string | null;
      setAttribute?: (name: string, value: string) => void;
    };
    if (!el || el.tagName !== 'A' || typeof el.getAttribute !== 'function') return;
    const href = el.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) return;
    const tokens = new Set((el.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean));
    tokens.add('external');
    tokens.add('noopener');
    tokens.add('nofollow');
    el.setAttribute?.('rel', [...tokens].join(' '));
  });
  purify.addHook('uponSanitizeAttribute', (node, data) => {
    if (typeof data.attrValue !== 'string') {
      return;
    }
    if (
      (data.attrName === 'src' || data.attrName === 'srcset' || data.attrName === 'href') &&
      /^\s*data:/i.test(data.attrValue)
    ) {
      // Defense in depth for the data: exemption removal below: even if a
      // future DOMPurify config change re-enables data: on media tags, these
      // attributes are dropped here.
      data.keepAttr = false;
      return;
    }
    if (data.attrName === 'style' && data.attrValue.length > 0) {
      // A style attribute whose declarations are all rejected collapses to an
      // empty value (harmless); DOMPurify keeps no dangerous residue either way.
      data.attrValue = sanitizeStyleAttribute(data.attrValue);
    }
  });
  return purify as unknown as PurifyWindow;
}

let purify = createPurify();
let sanitizeCount = 0;

/**
 * The JSDOM window behind DOMPurify accumulates per-window caches over a
 * long-lived server process. Recreate it periodically. Same config, same
 * output; this only bounds memory growth (reference CMS workaround, verified
 * in its production deployment).
 */
const RESET_EVERY = 2000;

export function resetSanitizer(): void {
  purify = createPurify();
  sanitizeCount = 0;
}

const SANITIZE_CONFIG: Record<string, unknown> = {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR: [...ALLOWED_ATTR],
  ALLOWED_URI_REGEXP,
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
  // NOTE: DOMPurify grants `data:` URIs a blanket pass on media tags that
  // bypasses ALLOWED_URI_REGEXP, and ADD_DATA_URI_TAGS can only extend that
  // exemption. The data: rejection therefore lives in the
  // uponSanitizeAttribute hook above (keepAttr = false), not in config.
};

/**
 * Sanitize an HTML fragment against the allowlist. Deterministic: identical
 * input always produces identical output.
 */
export function sanitizeHtml(dirty: string): string {
  if (sanitizeCount >= RESET_EVERY) {
    resetSanitizer();
  }
  sanitizeCount += 1;
  return purify.sanitize(dirty, SANITIZE_CONFIG);
}
