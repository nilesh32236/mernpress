import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
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

  it('accepts an optional dark palette and exposes it', () => {
    const dark = {
      background: '#121212',
      surface: '#1c1c1c',
      text: '#e8e8e8',
      muted: '#a1a1a1',
      accent: '#7aa7ff',
    };
    const tokens = { ...baseManifest().tokens, dark };
    const validated = validateThemeManifest(baseManifest({ tokens }));
    expect(validated?.tokens.dark).toEqual(dark);
  });

  it('keeps the manifest valid when no dark palette is declared', () => {
    const validated = validateThemeManifest(baseManifest());
    expect(validated).not.toBeNull();
    expect(validated?.tokens.dark).toBeUndefined();
  });

  it('rejects a malformed dark palette instead of half-dark themes', () => {
    const withDark = (dark: Record<string, unknown>) =>
      validateThemeManifest(baseManifest({ tokens: { ...baseManifest().tokens, dark } }));
    // A missing colour, a non-hex colour and a CSS injection are all rejected.
    expect(
      withDark({ background: '#121212', surface: '#1c1c1c', text: '#e8e8e8', muted: '#a1a1a1' }),
    ).toBeNull();
    expect(
      withDark({
        background: '#121212',
        surface: '#1c1c1c',
        text: '#e8e8e8',
        muted: '#a1a1a1',
        accent: 'red; background-image: url(https://evil/x)',
      }),
    ).toBeNull();
    expect(
      withDark({
        background: '#121212',
        surface: '#1c1c1c',
        text: '#e8e8e8',
        muted: '#a1a1a1',
        accent: 'var(--x)',
      }),
    ).toBeNull();
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
  it('refreshes a bundled theme when the release ships a newer version', async () => {
    const storeDir = mkdtempSync(path.join(tmpdir(), 'mernpress-theme-refresh-'));
    const seedDir = mkdtempSync(path.join(tmpdir(), 'mernpress-theme-seed-'));
    try {
      const writeTheme = (dir: string, version: string, background: string) => {
        mkdirSync(path.join(dir, 'sample'), { recursive: true });
        writeFileSync(
          path.join(dir, 'sample', 'theme.json'),
          JSON.stringify({
            ...baseManifest(),
            id: 'sample',
            version,
            tokens: { ...baseManifest().tokens, background },
          }),
        );
      };
      // Installed 1.0.0 has no dark palette; the release ships 1.1.0 with one.
      writeTheme(storeDir, '1.0.0', '#ffffff');
      writeFileSync(path.join(storeDir, '.initialized'), 'seeded\n');
      writeTheme(seedDir, '1.1.0', '#101010');

      await seedThemeStore({ storeDir, seedDir });

      const installed = JSON.parse(
        readFileSync(path.join(storeDir, 'sample', 'theme.json'), 'utf8'),
      ) as { version: string; tokens: { background: string } };
      expect(installed.version).toBe('1.1.0');
      expect(installed.tokens.background).toBe('#101010');
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
      rmSync(seedDir, { recursive: true, force: true });
    }
  });

  it('keeps an installed theme that is not older than the release', async () => {
    const storeDir = mkdtempSync(path.join(tmpdir(), 'mernpress-theme-keep-'));
    const seedDir = mkdtempSync(path.join(tmpdir(), 'mernpress-theme-keepseed-'));
    try {
      const writeTheme = (dir: string, version: string, background: string) => {
        mkdirSync(path.join(dir, 'sample'), { recursive: true });
        writeFileSync(
          path.join(dir, 'sample', 'theme.json'),
          JSON.stringify({
            ...baseManifest(),
            id: 'sample',
            version,
            tokens: { ...baseManifest().tokens, background },
          }),
        );
      };
      // The installed copy is newer than the bundled one (for example a future
      // package the operator installed): it must not be downgraded.
      writeTheme(storeDir, '2.0.0', '#222222');
      writeFileSync(path.join(storeDir, '.initialized'), 'seeded\n');
      writeTheme(seedDir, '1.9.0', '#101010');

      await seedThemeStore({ storeDir, seedDir });

      const installed = JSON.parse(
        readFileSync(path.join(storeDir, 'sample', 'theme.json'), 'utf8'),
      ) as { version: string; tokens: { background: string } };
      expect(installed.version).toBe('2.0.0');
      expect(installed.tokens.background).toBe('#222222');
    } finally {
      rmSync(storeDir, { recursive: true, force: true });
      rmSync(seedDir, { recursive: true, force: true });
    }
  });

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
