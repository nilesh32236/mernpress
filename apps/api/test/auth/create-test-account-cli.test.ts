import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Spawn-level tests for the `pnpm dev:create-test-account` CLI wrapper: the
 * production refusal and the opt-in requirement live in the CLI, not the domain
 * use-case, so they are exercised by invoking the CLI as a subprocess.
 */

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(apiRoot, 'src/cli/create-test-account.ts');

function runCli(args: string[], env: NodeJS.ProcessEnv): { status: number | null; output: string } {
  const result = spawnSync('pnpm', ['exec', 'tsx', cli, ...args], {
    cwd: apiRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('dev:create-test-account CLI safeguards', () => {
  it('refuses to run when NODE_ENV=production (exit 1, before any DB work)', () => {
    const { status, output } = runCli(['--i-understand-dev-only', '--role', 'editor'], {
      NODE_ENV: 'production',
    });
    expect(status).toBe(1);
    expect(output).toMatch(/production/i);
  });

  it('refuses without the explicit opt-in flag (exit 1)', () => {
    const { status, output } = runCli(['--role', 'editor'], { NODE_ENV: 'test' });
    expect(status).toBe(1);
    expect(output).toMatch(/opt-in|i-understand-dev-only/i);
  });

  it('refuses to create an administrator (exit 1)', () => {
    const { status, output } = runCli(['--i-understand-dev-only', '--role', 'administrator'], {
      NODE_ENV: 'test',
    });
    expect(status).toBe(1);
    expect(output).toMatch(/administrator is not allowed/i);
  });
});
