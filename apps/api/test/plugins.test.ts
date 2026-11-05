import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createPluginService } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
});

afterEach(async () => {
  await app.close();
});

async function adminHeaders() {
  const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
  return {
    origin: ADMIN_ORIGIN,
    cookie: cookieHeader,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json',
  };
}

describe('plugins api', () => {
  it('lists the bundled plugin as inactive by default', async () => {
    const headers = await adminHeaders();
    const response = await app.inject({ method: 'GET', url: '/api/admin/plugins', headers });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      plugins: Array<{ id: string; active: boolean; name: string }>;
      counts: { all: number; active: number; inactive: number };
    };
    expect(body.plugins).toHaveLength(3);
    expect(body.plugins.find((plugin) => plugin.id === 'hello-mernpress')).toMatchObject({
      active: false,
    });
    expect(body.plugins.find((plugin) => plugin.id === 'auto-excerpt')).toMatchObject({
      active: false,
    });
    expect(body.plugins.find((plugin) => plugin.id === 'seo-fallback')).toMatchObject({
      active: false,
    });
    expect(body.counts).toEqual({ all: 3, active: 0, inactive: 3 });
  });

  it('activates and deactivates a plugin and exposes its toolbar message', async () => {
    const headers = await adminHeaders();
    const { 'content-type': _contentType, ...noBody } = headers;

    const activated = await app.inject({
      method: 'POST',
      url: '/api/admin/plugins/hello-mernpress/activate',
      headers: noBody,
    });
    expect(activated.statusCode).toBe(200);
    expect((activated.json() as { counts: { active: number } }).counts.active).toBe(1);

    const toolbar = await app.inject({
      method: 'GET',
      url: '/api/admin/plugins/toolbar',
      headers: { cookie: headers.cookie },
    });
    expect(toolbar.statusCode).toBe(200);
    expect(typeof (toolbar.json() as { message: string | null }).message).toBe('string');

    const deactivated = await app.inject({
      method: 'POST',
      url: '/api/admin/plugins/hello-mernpress/deactivate',
      headers: noBody,
    });
    expect(deactivated.statusCode).toBe(200);

    const empty = await app.inject({
      method: 'GET',
      url: '/api/admin/plugins/toolbar',
      headers: { cookie: headers.cookie },
    });
    expect(empty.json()).toEqual({ message: null });
  });

  it('stores the automatic update preference', async () => {
    const headers = await adminHeaders();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/plugins/auto-updates',
      headers,
      payload: { enabled: true },
    });
    expect(response.statusCode).toBe(200);
    expect(
      (response.json() as { plugins: Array<{ autoUpdates: boolean }> }).plugins[0]!.autoUpdates,
    ).toBe(true);
  });

  it('rejects unknown plugins, anonymous callers and non-administrators', async () => {
    const headers = await adminHeaders();
    const { 'content-type': _contentType, ...noBody } = headers;
    const missing = await app.inject({
      method: 'POST',
      url: '/api/admin/plugins/nope/activate',
      headers: noBody,
    });
    expect(missing.statusCode).toBe(404);

    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/plugins' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const { cookieHeader } = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const editor = await app.inject({
      method: 'GET',
      url: '/api/admin/plugins',
      headers: { cookie: cookieHeader },
    });
    expect(editor.statusCode).toBe(403);
  });

  it('supports an injected plugin registry (runtime contract)', async () => {
    const service = createPluginService({
      prisma: app.database,
      pluginDir: '/tmp/unused-plugin-dir',
      seedDir: '/tmp/unused-plugin-seed',
      plugins: [
        {
          id: 'sample',
          name: 'Sample',
          version: '0.1.0',
          author: 'Tests',
          description: 'A sample plugin.',
          details: 'Test only.',
        },
      ],
      now: () => new Date('2026-11-04T10:00:00.000Z'),
    });
    const principal = { userId: '00000000-0000-7000-8000-000000000000', role: 'administrator' };
    const listed = await service.list(principal);
    expect(listed.plugins.map((plugin) => plugin.id)).toEqual(['sample']);
    const activated = await service.activate(principal, 'sample');
    expect(activated.counts.active).toBe(1);
    const toolbar = await service.toolbar(principal);
    expect(toolbar.message).toBeNull();
  });
  it('deletes an inactive plugin, hides it, and refuses to delete an active one', async () => {
    const headers = await adminHeaders();
    const { 'content-type': _contentType, ...noBody } = headers;

    const active = await app.inject({
      method: 'POST',
      url: '/api/admin/plugins/hello-mernpress/activate',
      headers: noBody,
    });
    expect(active.statusCode).toBe(200);

    const refused = await app.inject({
      method: 'DELETE',
      url: '/api/admin/plugins/hello-mernpress',
      headers: noBody,
    });
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: { message: string } }).error.message).toBe(
      'Deactivate the plugin before deleting it.',
    );

    await app.inject({
      method: 'POST',
      url: '/api/admin/plugins/hello-mernpress/deactivate',
      headers: noBody,
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/admin/plugins/hello-mernpress',
      headers: noBody,
    });
    expect(deleted.statusCode).toBe(200);
    const body = deleted.json() as {
      plugins: unknown[];
      counts: { all: number; active: number; inactive: number };
    };
    expect(body.plugins.map((plugin) => (plugin as { id: string }).id)).toEqual([
      'auto-excerpt',
      'seo-fallback',
    ]);
    expect(body.counts).toEqual({ all: 2, active: 0, inactive: 2 });

    const toolbar = await app.inject({
      method: 'GET',
      url: '/api/admin/plugins/toolbar',
      headers: { cookie: headers.cookie },
    });
    expect(toolbar.json()).toEqual({ message: null });

    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/admin/plugins/hello-mernpress',
      headers: noBody,
    });
    expect(missing.statusCode).toBe(404);
  });
  it('removes the package directory and stays removed across restarts', async () => {
    const pluginDir = mkdtempSync(path.join(tmpdir(), 'mernpress-plugins-'));
    const seedDir = fileURLToPath(new URL('../../../plugins', import.meta.url));
    const principal = { userId: '00000000-0000-7000-8000-000000000000', role: 'administrator' };
    try {
      const service = createPluginService({ prisma: app.database, pluginDir, seedDir });
      const initial = await service.list(principal);
      expect(initial.plugins.map((plugin) => plugin.id)).toEqual([
        'auto-excerpt',
        'hello-mernpress',
        'seo-fallback',
      ]);
      expect(existsSync(path.join(pluginDir, 'hello-mernpress', 'plugin.json'))).toBe(true);

      await service.activate(principal, 'hello-mernpress');
      await service.deactivate(principal, 'hello-mernpress');
      const removed = await service.remove(principal, 'hello-mernpress');
      expect(removed.plugins.map((plugin) => plugin.id)).toEqual(['auto-excerpt', 'seo-fallback']);
      expect(existsSync(path.join(pluginDir, 'hello-mernpress'))).toBe(false);

      // A new service process (or a restart) must not re-seed a deleted package.
      const restarted = createPluginService({ prisma: app.database, pluginDir, seedDir });
      const after = await restarted.list(principal);
      expect(after.plugins.map((plugin) => plugin.id)).toEqual(['auto-excerpt', 'seo-fallback']);
      const toolbar = await restarted.toolbar(principal);
      expect(toolbar).toEqual({ message: null });
    } finally {
      rmSync(pluginDir, { recursive: true, force: true });
    }
  });
  it('loads a trusted plugin module and disposes its filters on deactivation', async () => {
    const pluginDir = mkdtempSync(path.join(tmpdir(), 'mernpress-plugin-runtime-'));
    const seedDir = fileURLToPath(new URL('../../../plugins', import.meta.url));
    const principal = { userId: '00000000-0000-7000-8000-000000000000', role: 'administrator' };
    const draft = {
      type: 'post' as const,
      title: 'Hello',
      slug: 'hello',
      excerpt: null,
      content: '<!-- wp:paragraph --><p>' + 'word '.repeat(60) + '</p><!-- /wp:paragraph -->',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    };
    try {
      const service = createPluginService({
        prisma: app.database,
        pluginDir,
        seedDir,
        hooks: app.contentHooks,
      });
      expect((await service.list(principal)).plugins.map((plugin) => plugin.id)).toContain(
        'auto-excerpt',
      );

      await service.activate(principal, 'auto-excerpt');
      const filtered = await app.contentHooks.applyFilters('content.post.create', draft);
      expect(filtered.excerpt).toMatch(/^word word/);
      expect(filtered.excerpt?.endsWith('…')).toBe(true);
      expect(filtered.excerpt?.length).toBeLessThanOrEqual(161);

      // An author-written excerpt is never overwritten.
      const authored = await app.contentHooks.applyFilters('content.post.create', {
        ...draft,
        excerpt: 'My own summary',
      });
      expect(authored.excerpt).toBe('My own summary');

      await service.deactivate(principal, 'auto-excerpt');
      const after = await app.contentHooks.applyFilters('content.post.create', draft);
      expect(after.excerpt).toBeNull();
    } finally {
      await app.contentHooks.dispose();
      rmSync(pluginDir, { recursive: true, force: true });
    }
  });
  it('fills missing SEO fields from visible content and preserves authored values', async () => {
    const pluginDir = mkdtempSync(path.join(tmpdir(), 'mernpress-seo-plugin-'));
    const seedDir = fileURLToPath(new URL('../../../plugins', import.meta.url));
    const principal = { userId: '00000000-0000-7000-8000-000000000000', role: 'administrator' };
    const draft = {
      type: 'post' as const,
      title: 'A visible title',
      slug: 'visible-title',
      excerpt: 'A short excerpt used for the description.',
      content: '<!-- wp:paragraph --><p>Body text.</p><!-- /wp:paragraph -->',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    };
    try {
      const service = createPluginService({
        prisma: app.database,
        pluginDir,
        seedDir,
        hooks: app.contentHooks,
      });
      await service.activate(principal, 'seo-fallback');
      const filled = await app.contentHooks.applyFilters('content.post.create', draft);
      expect(filled.seoDescription).toBe('A short excerpt used for the description.');
      expect(filled.ogTitle).toBe('A visible title');
      expect(filled.ogDescription).toBe('A short excerpt used for the description.');

      const authored = await app.contentHooks.applyFilters('content.post.create', {
        ...draft,
        seoDescription: 'My own meta description',
        ogTitle: 'My own social title',
      });
      expect(authored.seoDescription).toBe('My own meta description');
      expect(authored.ogTitle).toBe('My own social title');

      // Without an excerpt the body is used, stripped of block delimiters.
      const fromBody = await app.contentHooks.applyFilters('content.post.create', {
        ...draft,
        excerpt: null,
        content:
          '<!-- wp:paragraph --><p>' + 'Body words. '.repeat(30) + '</p><!-- /wp:paragraph -->',
      });
      expect(fromBody.seoDescription).toMatch(/^Body words\./);
      expect(fromBody.seoDescription?.endsWith('…')).toBe(true);

      await service.deactivate(principal, 'seo-fallback');
      const after = await app.contentHooks.applyFilters('content.post.create', draft);
      expect(after.seoDescription).toBeNull();
    } finally {
      await app.contentHooks.dispose();
      rmSync(pluginDir, { recursive: true, force: true });
    }
  });
});
