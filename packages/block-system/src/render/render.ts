import type { ContentIssueCode, ParsedBlock } from '../contracts.js';
import { parseBlockMarkup } from '../parser.js';
import { validateBlockMarkup } from '../validate.js';
import { sanitizeHtml } from '../sanitize.js';

/**
 * Server-side block renderer (ADR 0007).
 *
 * Pipeline: parse → structural validate → reassemble each block from
 * `innerContent` (rendered inner blocks spliced into the null placeholders)
 * → deterministic heading anchors + TOC → per-block allowlist sanitize.
 *
 * The renderer is uniform for the static MVP block set: saved inner HTML is
 * authoritative markup and the sanitizer is the security boundary. Unknown
 * and freeform blocks render their sanitized inner HTML; stored markup is
 * never rewritten.
 */

export interface RenderedTocEntry {
  level: number;
  id: string;
  text: string;
}

export interface RenderWarning {
  blockName: string | null;
  message: string;
}

export interface RenderResult {
  html: string;
  toc: RenderedTocEntry[];
  warnings: RenderWarning[];
}

export class RenderError extends Error {
  readonly code: ContentIssueCode;

  constructor(code: ContentIssueCode, message: string) {
    super(message);
    this.name = 'RenderError';
    this.code = code;
  }
}

/** Bump when rendered output semantics change; reserved for a future render cache. */
export const RENDER_VERSION = 1;

const HEADING_TAG = /^<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/i;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 80);
  return slug.length > 0 ? slug : 'section';
}

/**
 * Reassemble a block's document HTML from its parsed parts. `innerContent`
 * strings are literal chunks; `null` placeholders receive the rendered inner
 * blocks in order. When placeholders and children disagree (hand-edited or
 * malformed markup), remaining children are appended rather than dropped.
 */
function assembleInner(block: ParsedBlock, renderedChildren: string[]): string {
  if (block.innerContent.length === 0) {
    return block.innerHTML;
  }
  let html = '';
  let childIndex = 0;
  for (const chunk of block.innerContent) {
    if (chunk === null) {
      html += renderedChildren[childIndex] ?? '';
      childIndex += 1;
    } else {
      html += chunk;
    }
  }
  while (childIndex < renderedChildren.length) {
    html += renderedChildren[childIndex] ?? '';
    childIndex += 1;
  }
  return html;
}

interface HeadingOutcome {
  html: string;
  entry: RenderedTocEntry | null;
}

/**
 * Give rendered headings a stable anchor id and record the TOC entry. An
 * explicit `anchor` attribute wins; otherwise a slug is derived from the
 * heading text and de-duplicated per render call.
 */
function processHeading(
  block: ParsedBlock,
  html: string,
  usedIds: Map<string, number>,
): HeadingOutcome {
  // Match against the trimmed document but splice by offset so leading
  // whitespace survives verbatim and no stray characters are orphaned.
  const leading = html.length - html.trimStart().length;
  const trimmed = html.slice(leading);
  const match = HEADING_TAG.exec(trimmed);
  if (!match) {
    return { html, entry: null };
  }
  const level = Number(match[1]);
  const attrsText = match[2] ?? '';
  const idAttr = /\sid="([^"]+)"/i.exec(attrsText)?.[1];
  const existingId = idAttr && idAttr.length > 0 ? idAttr : undefined;
  const rawAnchor = block.attrs['anchor'];
  const anchorAttr = typeof rawAnchor === 'string' && rawAnchor.length > 0 ? rawAnchor : undefined;
  const text = stripTags(match[3] ?? '');

  let id = existingId ?? anchorAttr ?? slugifyHeading(text);
  const seen = usedIds.get(id);
  if (seen !== undefined) {
    if (!existingId && !anchorAttr) {
      // WordPress convention: first duplicate gets -2, then -3, …
      usedIds.set(id, seen + 1);
      id = `${id}-${seen + 2}`;
    }
  } else {
    usedIds.set(id, 0);
  }

  let out = html;
  if (!existingId) {
    const tag = match[0].replace(/^<h[1-6]\b[^>]*>/i, (open) => {
      return `${open.slice(0, -1)} id="${id}">`;
    });
    out =
      html.slice(0, leading + match.index) +
      tag +
      html.slice(leading + match.index + match[0].length);
  }
  return { html: out, entry: { level, id, text } };
}

/**
 * Render one block to sanitized HTML. Fails closed: a block whose assembly
 * or sanitization throws falls back to its sanitized inner HTML, then to an
 * empty string, and records a warning instead of breaking the document.
 */
function renderBlock(
  block: ParsedBlock,
  usedIds: Map<string, number>,
  toc: RenderedTocEntry[],
  warnings: RenderWarning[],
): string {
  try {
    const renderedChildren = block.innerBlocks.map((child) =>
      renderBlock(child, usedIds, toc, warnings),
    );
    let html = assembleInner(block, renderedChildren);

    if (block.blockName === 'core/heading') {
      const outcome = processHeading(block, html, usedIds);
      html = outcome.html;
      if (outcome.entry) {
        toc.push(outcome.entry);
      }
    }

    return sanitizeHtml(html);
  } catch (error) {
    warnings.push({
      blockName: block.blockName,
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      return sanitizeHtml(block.innerHTML);
    } catch {
      return '';
    }
  }
}

/**
 * Render WordPress-compatible serialized block markup to sanitized HTML.
 *
 * Structural limits (2 MB / 5,000 blocks / depth 20) are enforced before any
 * rendering; violations throw `RenderError`. Output is deterministic for the
 * same input.
 */
export function renderBlockMarkup(markup: string): RenderResult {
  const validation = validateBlockMarkup(markup);
  if (!validation.ok) {
    throw new RenderError(
      validation.code ?? 'CONTENT_TOO_LARGE',
      validation.message ?? 'Content is not renderable',
    );
  }

  const blocks = parseBlockMarkup(markup);
  const usedIds = new Map<string, number>();
  const toc: RenderedTocEntry[] = [];
  const warnings: RenderWarning[] = [];

  const html = blocks
    .map((block) => renderBlock(block, usedIds, toc, warnings))
    .join('')
    // Block delimiters are markup comments; nothing else may leave comment
    // residue in the rendered document.
    .replace(/<!--\s*\/?wp:[^>]*-->/g, '');

  return { html, toc, warnings };
}
