import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Environment variable that carries the run's temporary storage root. */
export const TEST_STORAGE_ROOT_ENV = 'MERNPRESS_TEST_STORAGE_ROOT';

/**
 * One temporary storage root per test run.
 *
 * The API tests need their own media/plugin/theme/backup directories. Creating
 * them directly in the operating system's temp directory leaked them: a suite
 * run left thousands of `mernpress-test-*` directories behind and the
 * accumulated leftovers filled the host's tmpfs, which then broke PostgreSQL
 * and every other service that writes to `/tmp`.
 *
 * The root is handed to the workers through the environment and removed when
 * the run ends — including when a worker is killed, which is why the cleanup
 * lives here and not in a worker exit handler (worker threads never run
 * `process.on('exit')`).
 */
export async function setup(): Promise<() => Promise<void>> {
  const root = mkdtempSync(path.join(tmpdir(), 'mernpress-test-run-'));
  process.env[TEST_STORAGE_ROOT_ENV] = root;
  return async () => {
    delete process.env[TEST_STORAGE_ROOT_ENV];
    rmSync(root, { recursive: true, force: true });
  };
}
