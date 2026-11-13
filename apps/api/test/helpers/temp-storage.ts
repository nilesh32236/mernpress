import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TEST_STORAGE_ROOT_ENV } from '../global-setup.js';

/**
 * Temporary storage directories for the test suite.
 *
 * Every test that builds an app needs its own media/plugin/theme/backup
 * directory. The directories must not be visible to each other, but they must
 * also not pile up in the operating system's temp directory: a run used to
 * leave thousands of `mernpress-test-*` directories behind, and the leftovers
 * filled the host's tmpfs (which then broke PostgreSQL and the reference
 * server).
 *
 * The run's temp root is created by `test/global-setup.ts` and handed over
 * through the environment; the workers only add directories inside it, and the
 * teardown removes the whole root.
 */
const root =
  process.env[TEST_STORAGE_ROOT_ENV] ?? mkdtempSync(path.join(tmpdir(), 'mernpress-test-run-'));

if (!process.env[TEST_STORAGE_ROOT_ENV]) {
  // No global setup (a single file run): clean up when the process exits.
  process.on('exit', () => {
    rmSync(root, { recursive: true, force: true });
  });
}

/** A unique temporary directory inside the run's storage root. */
export function makeTempDir(prefix: string): string {
  const directory = path.join(root, `${prefix}-${randomUUID()}`);
  mkdirSync(directory, { recursive: true });
  return directory;
}
