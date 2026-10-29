import { registerCoreBlocks } from '@wordpress/block-library';
import * as wpBlockEditor from '@wordpress/block-editor';
import * as wpBlockLibrary from '@wordpress/block-library';
import * as wpBlocks from '@wordpress/blocks';
import * as wpComponents from '@wordpress/components';
import * as wpData from '@wordpress/data';
import * as wpElement from '@wordpress/element';
import * as wpFormatLibrary from '@wordpress/format-library';
import * as wpHooks from '@wordpress/hooks';
import * as wpI18n from '@wordpress/i18n';
import { actionErrorMessage, uploadMedia } from '../api.js';

/**
 * Browser-only editor bootstrap. This module is imported exclusively from the
 * lazily-loaded editor chunk, so the ~5 MB WordPress bundle never reaches the
 * dashboard, lists or login route.
 */

/**
 * The MVP block set (docs/architecture/gutenberg-and-rendering.md §6). The
 * inserter and the editor both honour this allowlist; every block here is a
 * core block whose saved markup the future API renderer can handle.
 */
export const SUPPORTED_BLOCKS = [
  'core/paragraph',
  'core/heading',
  'core/list',
  'core/list-item',
  'core/quote',
  'core/image',
  'core/separator',
  'core/spacer',
  'core/buttons',
  'core/button',
  'core/columns',
  'core/column',
  'core/group',
  'core/code',
  'core/preformatted',
] as const;

let bootstrapped = false;

/**
 * Register the block library exactly once and expose the WordPress namespace
 * some package internals still probe. Guarded so React StrictMode double
 * rendering and HMR cannot re-register blocks.
 */
export function ensureEditorBootstrap(): void {
  if (bootstrapped) {
    return;
  }
  bootstrapped = true;

  registerCoreBlocks();

  if (typeof window !== 'undefined') {
    const scope = window as unknown as { wp?: Record<string, unknown> };
    if (!scope.wp) {
      scope.wp = {
        blocks: wpBlocks,
        blockEditor: wpBlockEditor,
        blockLibrary: wpBlockLibrary,
        components: wpComponents,
        data: wpData,
        element: wpElement,
        formatLibrary: wpFormatLibrary,
        hooks: wpHooks,
        i18n: wpI18n,
      };
    }
  }
}

/** The subset of Gutenberg's media object the image block reads back. */
export interface EditorUploadedMedia {
  id: string;
  url: string;
  alt: string;
  caption: string;
}

/**
 * The exact shape Gutenberg hands to `settings.mediaUpload` (see
 * `MediaPlaceholder.onFilesUpload` in @wordpress/block-editor). `filesList`
 * may contain `File` objects from the picker/drop zone or bare `Blob`s when a
 * block is dropped with an HTML image source, hence the `Blob` union.
 */
export interface EditorMediaUploadArgs {
  filesList?: FileList | Array<File | Blob> | null;
  onFileChange?: (media: EditorUploadedMedia[]) => void;
  onError?: (message: string) => void;
  allowedTypes?: string[];
  multiple?: boolean;
  additionalData?: Record<string, unknown>;
}

/**
 * Give the API a real `File` for every entry. Dropped HTML images arrive as a
 * bare `Blob`; the server sniffs the bytes, so the synthesised name only needs
 * a sane extension and the blob's own MIME type.
 */
function asUploadFile(value: File | Blob, index: number): File {
  if (typeof File !== 'undefined' && value instanceof File) {
    return value;
  }
  const type = value.type || 'image/webp';
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'webp';
  return new File([value], `upload-${index + 1}.${extension}`, { type });
}

/**
 * Implementation of Gutenberg's `settings.mediaUpload` contract.
 *
 * Each file is uploaded through the media API; per-file results are reported
 * with `onFileChange([{ id, url, alt, caption }])` because the standalone
 * `BlockEditorProvider` has no `@wordpress/media-utils` layer. Errors are
 * reported through `onError` so the block surfaces a notice. The returned
 * function aborts in-flight uploads (Gutenberg calls it on unmount/cleanup).
 */
export function mediaUpload({
  filesList,
  onFileChange,
  onError,
}: EditorMediaUploadArgs): () => void {
  const files = filesList ? Array.from(filesList) : [];
  const controller = new AbortController();
  let cancelled = false;

  void (async () => {
    for (const [index, value] of files.entries()) {
      if (cancelled) {
        return;
      }
      try {
        const item = await uploadMedia(asUploadFile(value, index), {
          signal: controller.signal,
        });
        if (cancelled) {
          return;
        }
        onFileChange?.([
          {
            id: item.id,
            url: item.url,
            alt: item.altText,
            caption: item.caption,
          },
        ]);
      } catch (error) {
        if (cancelled) {
          return;
        }
        onError?.(actionErrorMessage(error));
      }
    }
  })();

  return () => {
    cancelled = true;
    controller.abort();
  };
}

/**
 * Settings handed to BlockEditorProvider. Keep this small and deterministic:
 * the editor is a writing surface, not a theme customiser.
 */
export function editorSettings() {
  return {
    allowedBlockTypes: [...SUPPORTED_BLOCKS],
    hasFixedToolbar: false,
    // The image block's native "Upload" button and drag/drop both land here.
    // URL insertion stays available; the media-library modal is a follow-up.
    mediaUpload,
    __experimentalBlockPatterns: [],
    __experimentalBlockPatternCategories: [],
    supportsLayout: true,
    colors: [
      { name: 'Ink', slug: 'mernpress-ink', color: '#2c3338' },
      { name: 'Muted', slug: 'mernpress-muted', color: '#646970' },
      { name: 'Accent', slug: 'mernpress-accent', color: '#3858e9' },
      { name: 'Surface', slug: 'mernpress-surface', color: '#f6f7f7' },
    ],
    fontSizes: [
      { name: 'Small', slug: 'small', size: 13 },
      { name: 'Body', slug: 'body', size: 16 },
      { name: 'Large', slug: 'large', size: 20 },
      { name: 'Display', slug: 'display', size: 32 },
    ],
    __experimentalFeatures: {
      appearanceTools: true,
      layout: { contentSize: '720px', wideSize: '1080px' },
      color: { custom: true, text: true, background: true },
      typography: { customFontSize: true },
      spacing: { blockGap: true, margin: true, padding: true },
    },
  };
}
