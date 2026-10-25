import { AuthError, createAuthService } from '@mernpress/cms-core';
import { createDatabaseClient } from '@mernpress/database';
import { loadEnv } from '../config/env.js';
import { readLine, readSecret } from './read-secret.js';

interface CliOptions {
  help: boolean;
  username?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--') {
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      options.help = true;
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

    throw new Error(`Unknown argument: ${argument ?? ''}`);
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: pnpm auth:bootstrap [--username <name>]

Creates the first administrator from a TTY password prompt. Refuses if an
administrator already exists. For automation outside production, set
MERNPRESS_ADMIN_PASSWORD instead of passing a password in argv.`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const env = loadEnv();
  const environmentPassword = process.env['MERNPRESS_ADMIN_PASSWORD'];

  if (environmentPassword && env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing MERNPRESS_ADMIN_PASSWORD in production; use the interactive TTY prompt instead',
    );
  }

  const username =
    options.username ?? (process.stdin.isTTY ? await readLine('Username: ') : undefined);

  if (!username) {
    throw new Error('A username is required; pass --username or run in a TTY');
  }

  let password = environmentPassword;
  if (!password) {
    if (!process.stdin.isTTY) {
      throw new Error('A TTY is required for the password prompt; no password was provided');
    }
    password = await readSecret('Password: ');
    const confirmation = await readSecret('Confirm password: ');
    if (password !== confirmation) {
      throw new Error('Passwords do not match');
    }
  }

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
    const user = await auth.bootstrapAdmin({ username, password });
    console.log(`Created administrator "${user.username}".`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AuthError) {
    console.error(`Bootstrap refused: ${error.message}`);
  } else {
    console.error(`Bootstrap failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  process.exitCode = 1;
});
