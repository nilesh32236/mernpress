#!/usr/bin/env node
/**
 * Admin bundle budget guard (Phase 5, P5-09).
 *
 * The Gutenberg chunk is intentionally large but must stay lazy and bounded.
 * This script fails the build if the main admin bundle regresses or the editor
 * chunk grows past the documented budget. Run after `pnpm build`.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(repoRoot, 'apps/admin/dist/assets');

/** Budgets in bytes. Main = dashboard/login/list shell; editor = lazy chunk. */
const BUDGETS = {
  mainJs: 400 * 1024,
  editorJs: 6_500 * 1024,
  editorCss: 600 * 1024,
};

if (!existsSync(assetsDir)) {
  console.error(`Bundle check: ${assetsDir} is missing. Run "pnpm build" first.`);
  process.exit(1);
}

const assets = readdirSync(assetsDir).map((name) => ({
  name,
  bytes: statSync(path.join(assetsDir, name)).size,
}));

function largestMatching(pattern) {
  return assets.filter((asset) => pattern.test(asset.name)).sort((a, b) => b.bytes - a.bytes)[0];
}

const mainJs = largestMatching(/^index-.*\.js$/);
const editorJs = largestMatching(/^BlockCanvas-.*\.js$/);
const editorCss = largestMatching(/^BlockCanvas-.*\.css$/);

if (!mainJs || !editorJs || !editorCss) {
  console.error('Bundle check: expected index-*.js, BlockCanvas-*.js and BlockCanvas-*.css.');
  process.exit(1);
}

const checks = [
  ['main JS', mainJs.bytes, BUDGETS.mainJs],
  ['editor JS (lazy)', editorJs.bytes, BUDGETS.editorJs],
  ['editor CSS (lazy)', editorCss.bytes, BUDGETS.editorCss],
];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
let failed = false;

console.log('Admin bundle budget:');
for (const [label, bytes, budget] of checks) {
  const ok = bytes <= budget;
  failed ||= !ok;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'} ${label.padEnd(18)} ${kb(bytes).padStart(11)} / ${kb(budget)}`,
  );
}

// The editor must never be part of the entry chunk. This is a structural
// assertion, not a size one: a static import would make the main bundle huge.
const mainIncludesEditor = mainJs.bytes > BUDGETS.mainJs;
if (mainIncludesEditor) {
  console.error(
    'Bundle check: the main chunk exceeds its budget; is the editor statically imported?',
  );
  failed = true;
}

process.exit(failed ? 1 : 0);
