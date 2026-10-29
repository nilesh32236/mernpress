import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * WordPress package singletons.
 *
 * Gutenberg keeps its data stores, SlotFill contexts and block registry in
 * module state, so every `@wordpress/*` package must exist exactly once in the
 * browser graph. Vite's dependency pre-bundler can inline each entry's
 * dependencies into that entry's own chunk, which embeds (for example)
 * `@wordpress/notices` in both the block-editor and block-library chunks and
 * self-registers `core/notices` twice. Pre-bundle only the heavyweight editor
 * entries and exclude the store owners.
 *
 * Only packages this app declares are listed: Vite cannot resolve a
 * transitive-only package name from this workspace app. pnpm installs a single
 * version of each, so the direct list is sufficient for dedupe.
 */
const PREBUNDLE = [
  '@wordpress/block-editor',
  '@wordpress/block-library',
  '@wordpress/blocks',
  '@wordpress/components',
  '@wordpress/format-library',
];

const SINGLETONS = [
  '@wordpress/block-editor',
  '@wordpress/block-library',
  '@wordpress/blocks',
  '@wordpress/components',
  '@wordpress/data',
  '@wordpress/element',
  '@wordpress/format-library',
  '@wordpress/hooks',
  '@wordpress/i18n',
  '@wordpress/icons',
  '@wordpress/keyboard-shortcuts',
  '@wordpress/notices',
];

// Isolated E2E runs point the dev proxy at a throwaway API port; production
// keeps the documented 4000 default.
const apiProxyTarget = process.env['VITE_API_PROXY_TARGET'] ?? 'http://127.0.0.1:4000';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', ...PREBUNDLE, ...SINGLETONS],
  },
  optimizeDeps: {
    include: [...PREBUNDLE, ...SINGLETONS],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
