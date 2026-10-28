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

/** Media upload is Phase 6; the image block still accepts a URL. */
export const MEDIA_UPLOAD_MESSAGE =
  'The media library arrives in Phase 6. Use “Insert from URL” to add an image for now.';

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

export interface EditorMediaUploadArgs {
  filesList?: FileList | File[] | null;
  onError?: (message: string) => void;
}

/**
 * Settings handed to BlockEditorProvider. Keep this small and deterministic:
 * the editor is a writing surface, not a theme customiser.
 */
export function editorSettings() {
  return {
    allowedBlockTypes: [...SUPPORTED_BLOCKS],
    hasFixedToolbar: false,
    mediaUpload: ({ onError }: EditorMediaUploadArgs) => {
      onError?.(MEDIA_UPLOAD_MESSAGE);
    },
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
