import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Optional, dependency-free local PostgreSQL cluster for machines without a
 * configured system server (and without Docker). It listens on loopback only.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseDir = path.join(root, '.local', 'postgres');
const dataDir = path.join(baseDir, 'data');
const socketDir = path.join(baseDir, 'socket');
const logFile = path.join(baseDir, 'server.log');
const port = process.env['MERNPRESS_LOCAL_DB_PORT'] ?? '55432';
const databaseNames = ['mernpress_dev', 'mernpress_test'];
const user = 'mernpress';

function commandExists(command) {
  const result = spawnSync('sh', ['-c', `command -v ${command}`], { encoding: 'utf8' });
  return result.status === 0;
}

function requirePostgresBinaries() {
  for (const binary of ['initdb', 'pg_ctl', 'psql', 'createdb', 'pg_isready']) {
    if (!commandExists(binary)) {
      throw new Error(
        `PostgreSQL binary "${binary}" was not found on PATH. Install PostgreSQL 18 or use a system server.`,
      );
    }
  }
}

function pgCtl(args, options = {}) {
  return execFileSync('pg_ctl', ['-D', dataDir, ...args], {
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
  });
}

function isRunning() {
  const result = spawnSync('pg_ctl', ['-D', dataDir, 'status'], { encoding: 'utf8' });
  return result.status === 0;
}

function connectionArgs() {
  return ['-h', socketDir, '-p', port, '-U', user];
}

function ensureDatabase(databaseName) {
  const exists = spawnSync(
    'psql',
    [
      ...connectionArgs(),
      '-d',
      'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`,
    ],
    { encoding: 'utf8' },
  );

  if (exists.status !== 0) {
    throw new Error(`Could not query PostgreSQL: ${exists.stderr.trim()}`);
  }

  if (exists.stdout.trim() !== '1') {
    execFileSync('createdb', [...connectionArgs(), '-O', user, databaseName], { stdio: 'inherit' });
  }

  execFileSync(
    'psql',
    [
      ...connectionArgs(),
      '-d',
      databaseName,
      '-c',
      `ALTER DATABASE "${databaseName}" SET timezone TO 'UTC';`,
    ],
    { stdio: 'inherit' },
  );
}

function init() {
  requirePostgresBinaries();
  mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  mkdirSync(socketDir, { recursive: true, mode: 0o700 });

  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log(`Initializing a local PostgreSQL cluster in ${dataDir}`);
    execFileSync(
      'initdb',
      ['-D', dataDir, '-U', user, '--auth=trust', '--no-locale', '--encoding=UTF8'],
      { stdio: 'inherit' },
    );
  } else {
    console.log(`Local PostgreSQL cluster already initialized at ${dataDir}`);
  }

  start();
  console.log(`
Local database ready. Put this in .env:

DATABASE_URL=postgresql://${user}@127.0.0.1:${port}/mernpress_dev
TEST_DATABASE_URL=postgresql://${user}@127.0.0.1:${port}/mernpress_test

Stop it with: pnpm db:local:stop
This cluster is for local development only and listens on 127.0.0.1.
`);
}

function start() {
  requirePostgresBinaries();

  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    throw new Error('Local cluster is not initialized. Run "pnpm db:local:init" first.');
  }

  if (isRunning()) {
    console.log(`Local PostgreSQL is already running on 127.0.0.1:${port}`);
  } else {
    execFileSync(
      'pg_ctl',
      ['-D', dataDir, '-l', logFile, '-o', `-p ${port} -k ${socketDir} -h 127.0.0.1`, 'start'],
      { stdio: 'inherit' },
    );
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = spawnSync('pg_isready', [...connectionArgs(), '-d', 'postgres'], {
      encoding: 'utf8',
    });
    if (ready.status === 0) {
      for (const databaseName of databaseNames) {
        ensureDatabase(databaseName);
      }
      console.log(
        `Local PostgreSQL is ready on 127.0.0.1:${port} (mernpress_dev and mernpress_test)`,
      );
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }

  throw new Error(`PostgreSQL did not become ready. Check ${logFile}.`);
}

function stop() {
  requirePostgresBinaries();
  if (!isRunning()) {
    console.log('Local PostgreSQL is not running.');
    return;
  }
  pgCtl(['stop', '-m', 'fast']);
}

function status() {
  requirePostgresBinaries();
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('Local PostgreSQL cluster is not initialized.');
    return;
  }
  if (isRunning()) {
    console.log(`Local PostgreSQL is running on 127.0.0.1:${port}`);
  } else {
    console.log('Local PostgreSQL is stopped.');
  }
}

const command = process.argv[2];

try {
  switch (command) {
    case 'init':
      init();
      break;
    case 'start':
      start();
      break;
    case 'stop':
      stop();
      break;
    case 'status':
      status();
      break;
    default:
      console.error('Usage: node scripts/local-db.mjs <init|start|stop|status>');
      process.exit(1);
  }
} catch (error) {
  console.error(
    `\nLocal database error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
