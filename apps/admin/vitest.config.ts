import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        // @wordpress/blocks imports JSON with ESM import attributes that bare
        // Node rejects. Inlining lets Vite transform the package for tests,
        // matching the browser/Vite build behaviour.
        inline: [/@wordpress\//],
      },
    },
  },
});
