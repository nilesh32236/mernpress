import { parseBlockMarkup } from '@mernpress/block-system/parser';
import type { NoteBlockAnchor } from '../api.js';

/**
 * Block anchors for editor notes.
 *
 * A note stores the block name, its 0-based dot path and a hash of the block's
 * name, attributes and own HTML (children excluded). The hash lets the notes
 * panel follow a block when it moves and detect when its content has changed or
 * the block is gone.
 */
export interface BlockAnchor extends NoteBlockAnchor {
  label: string;
}

export type AnchorStatus = 'exact' | 'moved' | 'changed' | 'missing';

export interface AnchorResolution {
  status: AnchorStatus;
  /** The current block (null when missing). */
  anchor: BlockAnchor | null;
}

const BLOCK_LABEL_OVERRIDES: Record<string, string> = {
  html: 'HTML',
  'list-item': 'List item',
  quote: 'Quote',
  pullquote: 'Pull quote',
  preformatted: 'Preformatted',
};

/** Human label for a block name (`core/paragraph` → `Paragraph`). */
export function blockLabel(name: string): string {
  const short = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
  const override = BLOCK_LABEL_OVERRIDES[short];
  if (override) return override;
  return short
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Short plain-text fingerprint of a block's own HTML. */
export function blockText(innerHTML: string): string {
  return innerHTML
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#0?39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Loose comparison so a text edit stays "changed" while a replacement does not. */
function similarText(saved: string, current: string): boolean {
  const a = saved.trim().toLowerCase();
  const b = current.trim().toLowerCase();
  if (a.length === 0 || b.length === 0) return true;
  if (a.startsWith(b) || b.startsWith(a)) {
    return Math.min(a.length, b.length) >= 3;
  }
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  return prefix >= 12 && prefix / Math.min(a.length, b.length) >= 0.4;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/**
 * FNV-1a 64-bit as 16 lowercase hex characters. Deterministic, synchronous and
 * dependency-free; the server treats it as an opaque 16-hex token.
 */
export function blockHash(name: string, attrs: unknown, innerHTML: string): string {
  // Serializer output adds newlines around the block HTML; trim so the same
  // block hashes identically from stored content and from the selected block.
  const input = `${name}\u0000${stableStringify(attrs)}\u0000${innerHTML.trim()}`;
  let hash = 0xcbf29ce484222325n;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Flatten the parsed block tree into anchors, in document order. */
export function listBlockAnchors(markup: string): BlockAnchor[] {
  const anchors: BlockAnchor[] = [];
  const walk = (blocks: ReturnType<typeof parseBlockMarkup>, prefix: string): void => {
    let position = 0;
    for (const block of blocks) {
      // The serializer separates blocks with whitespace-only freeform HTML;
      // those are not blocks and must not shift the path indexes.
      if (
        block.blockName === null &&
        block.innerBlocks.length === 0 &&
        block.innerHTML.trim() === ''
      ) {
        continue;
      }
      const path = prefix === '' ? String(position) : `${prefix}.${position}`;
      position += 1;
      const name = block.blockName ?? 'core/html';
      anchors.push({
        name,
        path,
        hash: blockHash(name, block.attrs, block.innerHTML),
        text: blockText(block.innerHTML),
        label: blockLabel(name),
      });
      walk(block.innerBlocks, path);
    }
  };
  walk(parseBlockMarkup(markup), '');
  return anchors;
}

/**
 * Resolve a stored anchor against the current document:
 * - exact: same path, name and hash;
 * - moved: the hash exists on the same block name at another path;
 * - changed: the path/name still exist but the content hash changed;
 * - missing: no block of that name/hash remains.
 */
export function resolveBlockAnchor(
  saved: NoteBlockAnchor,
  anchors: BlockAnchor[],
): AnchorResolution {
  const exact = anchors.find(
    (candidate) =>
      candidate.path === saved.path &&
      candidate.name === saved.name &&
      candidate.hash === saved.hash,
  );
  if (exact) return { status: 'exact', anchor: exact };
  const moved = anchors.find(
    (candidate) => candidate.name === saved.name && candidate.hash === saved.hash,
  );
  if (moved) return { status: 'moved', anchor: moved };
  // A text edit keeps the block name and much of its text even when the block
  // also moved (hash changed). Prefer the same path, then any path.
  const changedSamePath = anchors.find(
    (candidate) =>
      candidate.path === saved.path &&
      candidate.name === saved.name &&
      similarText(saved.text, candidate.text),
  );
  if (changedSamePath) return { status: 'changed', anchor: changedSamePath };
  const changedElsewhere = anchors.find(
    (candidate) => candidate.name === saved.name && similarText(saved.text, candidate.text),
  );
  if (changedElsewhere) return { status: 'changed', anchor: changedElsewhere };
  return { status: 'missing', anchor: null };
}

/** Short, human-readable anchor text for badges and the composer. */
export function anchorSummary(anchor: BlockAnchor | NoteBlockAnchor): string {
  return `${blockLabel(anchor.name)} · block ${anchor.path}`;
}
