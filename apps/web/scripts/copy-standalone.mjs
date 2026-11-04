/* global console, process */
/**
 * Next.js `output: 'standalone'` produces a minimal server bundle, but the
 * static asset directory and `public/` are not copied automatically. The
 * production service starts `.next/standalone/apps/web/server.js`, so without
 * this step every CSS/font/image request 404s and pages render unstyled.
 */
import { cp, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(root, '.next', 'standalone', 'apps', 'web');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standalone))) {
  console.log('[copy-standalone] no standalone output; nothing to copy');
  process.exit(0);
}

await mkdir(join(standalone, '.next'), { recursive: true });
await cp(join(root, '.next', 'static'), join(standalone, '.next', 'static'), {
  recursive: true,
  force: true,
});

if (await exists(join(root, 'public'))) {
  await cp(join(root, 'public'), join(standalone, 'public'), {
    recursive: true,
    force: true,
  });
}

console.log('[copy-standalone] copied .next/static and public into the standalone bundle');
