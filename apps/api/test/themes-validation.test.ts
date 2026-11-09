import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { seedThemeStore, validateThemeManifest } from '@mernpress/cms-core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const themesDir = path.join(repoRoot, 'themes');

function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sample',
    name: 'Sample',
    version: '1.0.0',
    description: 'A sample theme.',
    screenshot: '/theme-sample.svg',
    layout: 'journal',
    tokens: {
      background: '#ffffff',
      surface: '#ffffff',
      text: '#111111',
      muted: '#666666',
      accent: '#0000ee',
      headingFont: 'Georgia, serif',
      bodyFont: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      contentWidth: '700px',
      radius: '10px',
      headerAlign: 'left',
    },
    ...overrides,
  };
}

describe('theme manifest validation', () => {
  it('accepts every bundled theme', () => {
    for (const id of readdirSync(themesDir)) {
      const raw = readFileSync(path.join(themesDir, id, 'theme.json'), 'utf8');
      expect(validateThemeManifest(JSON.parse(raw)), id).not.toBeNull();
    }
  });

  it('rejects CSS-injection attempts in token values', () => {
    const inject = (tokens: Record<string, unknown>) =>
      validateThemeManifest(baseManifest({ tokens: { ...baseManifest().tokens, ...tokens } }));
    expect(inject({ background: 'red; background-image: url(https://evil/x)' })).toBeNull();
    expect(inject({ text: 'url(javascript:alert(1))' })).toBeNull();
    expect(inject({ contentWidth: '700' })).toBeNull();
    expect(inject({ contentWidth: 'calc(100% - 2px)' })).toBeNull();
    expect(inject({ radius: '0; position: fixed' })).toBeNull();
    expect(inject({ headingFont: 'x; } body { display: none' })).toBeNull();
    expect(inject({ headerAlign: 'justify' })).toBeNull();
  });

  it('rejects traversal, remote screenshots and bad identifiers', () => {
    expect(validateThemeManifest(baseManifest({ screenshot: '/../etc/passwd' }))).toBeNull();
    expect(
      validateThemeManifest(baseManifest({ screenshot: 'https://evil.example/x.svg' })),
    ).toBeNull();
    expect(validateThemeManifest(baseManifest({ screenshot: 'theme.svg' }))).toBeNull();
    expect(validateThemeManifest(baseManifest({ id: '../escape' }))).toBeNull();
    expect(validateThemeManifest(baseManifest({ layout: 'sidebar' }))).toBeNull();
  });

  it('rejects non-integer or out-of-range font weights', () => {
    const withWeights = (weights: unknown[]) =>
      validateThemeManifest(
        baseManifest({ fonts: [{ family: 'Inter', source: 'theme', weights }] }),
      );
    expect(withWeights([400, 700])).not.toBeNull();
    expect(withWeights([400.5])).toBeNull();
    expect(withWeights([50])).toBeNull();
    expect(withWeights([1200])).toBeNull();
  });
});

describe('theme store seeding', () => {
  it('retries a failed seed instead of marking the store complete', async () => {
    const storeDir = mkdtempSync(path.join(tmpdir(), 'mernpress-theme-store-'));
    try {
      // First attempt: the seed directory does not exist yet.
      await seedThemeStore({ storeDir, seedDir: path.join(storeDir, 'missing-seed') });
      expect(readdirSync(storeDir)).not.toContain('.initialized');

      // Second attempt with the real seed directory copies the packages.
      await seedThemeStore({ storeDir, seedDir: themesDir });
      expect(readdirSync(storeDir)).toContain('.initialized');
      expect(existsSync(path.join(storeDir, 'mernpress', 'theme.json'))).toBe(true);
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });
});
