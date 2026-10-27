import { randomBytes } from 'node:crypto';
import { AuthError, createAuthService, type ManualTestRole } from '@mernpress/cms-core';
import { createDatabaseClient } from '@mernpress/database';
import { loadEnv } from '../config/env.js';

/**
 * Development-only, opt-in CLI to create manual-test accounts for the role
 * matrix (ADR 0004). This is NOT user administration (P2-05, deferred) and NOT a
 * public API. It exists only so the owner can exercise the role × capability
 * matrix locally during manual acceptance.
 *
 * Safeguards:
 * - refuses to run when NODE_ENV=production;
 * - requires the explicit opt-in flag `--i-understand-dev-only`;
 * - refuses to create an administrator (the first admin is bootstrap-only);
 * - never overwrites an existing account (a username collision is a 409);
 * - generates a one-time password printed ONCE to the terminal (never stored,
 *   logged, or written to a file) unless one is piped via env for automation;
 * - hashes with the same Argon2id service as normal authentication.
 */

const ALLOWED_ROLES: ReadonlySet<string> = new Set([
  'editor',
  'author',
  'contributor',
  'subscriber',
]);

interface CliOptions {
  help: boolean;
  optIn: boolean;
  username?: string;
  role?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { help: false, optIn: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--i-understand-dev-only') {
      options.optIn = true;
      continue;
    }
    if (argument === '--username') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--username requires a value');
      }
      options.username = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith('--username=')) {
      options.username = argument.slice('--username='.length);
      continue;
    }
    if (argument === '--role') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--role requires a value');
      }
      options.role = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith('--role=')) {
      options.role = argument.slice('--role='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument ?? ''}`);
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: pnpm dev:create-test-account --i-understand-dev-only --role <role> [--username <name>]

DEVELOPMENT ONLY. Creates a manual-test account for role-matrix acceptance
testing. Never for production, never for user administration.

Roles: editor | author | contributor | subscriber  (administrator is not allowed)
Prints a one-time password to the terminal exactly once. If --username is
omitted, a unique development-only username is generated.`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  // Production + opt-in guards run BEFORE loading config or touching the DB, so
  // a production invocation is refused even if env validation would fail anyway.
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to create manual-test accounts in production (NODE_ENV=production).');
  }
  if (!options.optIn) {
    throw new Error(
      'Refusing without the explicit opt-in flag. Re-run with --i-understand-dev-only to confirm this is a local development manual test.',
    );
  }

  const role = options.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    throw new Error(
      `--role must be one of: ${[...ALLOWED_ROLES].join(', ')} (administrator is not allowed).`,
    );
  }

  const env = loadEnv();

  // Unique, clearly-marked development-only username when none is given.
  const suffix = randomBytes(3).toString('hex');
  const username = options.username ?? `dev-${role}-${suffix}`;

  // One-time password: generated and printed once, never stored. The env var is
  // an automation escape hatch (production was already refused above).
  const envPassword = process.env['MERNPRESS_TEST_ACCOUNT_PASSWORD'];
  const password = envPassword ?? `Dev-${randomBytes(12).toString('base64url')}-Aa1!`;

  const client = createDatabaseClient({ connectionString: env.DATABASE_URL });
  const auth = createAuthService({
    prisma: client,
    config: {
      hashPepper: env.AUTH_HASH_PEPPER,
      sessionTtlMinutes: env.SESSION_TTL_MINUTES,
      sessionIdleMinutes: env.SESSION_IDLE_MINUTES,
      loginRateLimitMax: env.LOGIN_RATE_LIMIT_MAX,
      loginRateLimitWindowMinutes: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
    },
  });

  try {
    const user = await auth.createManualTestAccount({
      username,
      password,
      role: role as ManualTestRole,
    });
    console.log(`Created development-only ${role} account "${user.username}".`);
    if (!envPassword) {
      console.log(`One-time password (shown once, not stored): ${password}`);
    }
    console.log('Cleanup is optional and manual; this tool never deletes accounts.');
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AuthError) {
    console.error(`Refused: ${error.message}`);
  } else {
    console.error(`Failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  process.exitCode = 1;
});
