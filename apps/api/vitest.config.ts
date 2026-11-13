import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mernpress/block-system/parser': path.resolve(
        here,
        '../../packages/block-system/src/parser.ts',
      ),
      '@mernpress/block-system/structure': path.resolve(
        here,
        '../../packages/block-system/src/structure.ts',
      ),
      '@mernpress/block-system/validate': path.resolve(
        here,
        '../../packages/block-system/src/validate.ts',
      ),
      '@mernpress/block-system/sanitize': path.resolve(
        here,
        '../../packages/block-system/src/sanitize.ts',
      ),
      '@mernpress/block-system/render': path.resolve(
        here,
        '../../packages/block-system/src/render/index.ts',
      ),
      '@mernpress/block-system': path.resolve(here, '../../packages/block-system/src/index.ts'),
      '@mernpress/cms-core': path.resolve(here, '../../packages/cms-core/src/index.ts'),
      '@mernpress/database': path.resolve(here, '../../packages/database/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // One temporary storage root per run, removed when the run ends.
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
});
