import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

function fail(message) {
  console.error(`\nSetup failed: ${message}\n`);
  process.exit(1);
}

function parseNodeVersion(version) {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  return { major, minor, patch };
}

const nodeVersion = parseNodeVersion(process.versions.node);
if (nodeVersion.major !== 24 || nodeVersion.minor < 22) {
  fail(`Node 24.22.x is required; this process is Node ${process.versions.node}. Run "nvm use".`);
}

const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
if (!pnpmVersion.startsWith('12.')) {
  fail(
    `pnpm 12.x is required; found ${pnpmVersion}. Run "corepack enable" or install pnpm 12.15.0.`,
  );
}

if (!existsSync(envPath)) {
  if (process.env['DATABASE_URL']) {
    console.log('No .env file found; using DATABASE_URL from the process environment.');
  } else {
    console.error(
      `\nNo .env file found.\n\n1. Copy .env.example to .env:\n     cp .env.example .env\n2. Set DATABASE_URL to a PostgreSQL database you can access.\n3. Re-run: pnpm setup\n`,
    );
    process.exit(1);
  }
} else {
  const envContents = readFileSync(envPath, 'utf8');
  const databaseUrlLine = envContents
    .split('\n')
    .find((line) => line.trim().startsWith('DATABASE_URL='));
  const databaseUrl = databaseUrlLine?.slice('DATABASE_URL='.length).trim() ?? '';

  if (!databaseUrl) {
    fail('DATABASE_URL is missing from .env. Set it and re-run "pnpm setup".');
  }
  if (databaseUrl.includes('change-me')) {
    fail(
      'DATABASE_URL still contains the placeholder "change-me". Edit .env with real local credentials, then re-run "pnpm setup".',
    );
  }
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
}

run('pnpm', ['db:generate']);
run('pnpm', ['db:migrate']);
run('pnpm', ['db:seed']);

console.log(`
Setup complete.

Next steps:
  pnpm dev          # API :4000, admin :5173, web :3000
  pnpm test         # unit/integration tests (needs PostgreSQL)
  pnpm test:e2e     # Playwright smoke test (needs browsers installed)
  pnpm build        # production builds
`);
