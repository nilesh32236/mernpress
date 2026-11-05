import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { structureSignature, structureUnchanged } from '@mernpress/block-system/structure';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from '../helpers/auth.js';

const BASE_CONTENT =
  '<!-- wp:heading {"level":2} --><h2>Locked title</h2><!-- /wp:heading -->' +
  '<!-- wp:paragraph --><p>Body text.</p><!-- /wp:paragraph -->';
const TEXT_ONLY =
  '<!-- wp:heading {"level":2} --><h2>Rewritten title</h2><!-- /wp:heading -->' +
  '<!-- wp:paragraph --><p>Body text with <strong>bold</strong>.</p><!-- /wp:paragraph -->';
const ADDED_BLOCK = BASE_CONTENT + '<!-- wp:paragraph --><p>Extra block.</p><!-- /wp:paragraph -->';
const CHANGED_ATTRS =
  '<!-- wp:heading {"level":3} --><h2>Locked title</h2><!-- /wp:heading -->' +
  '<!-- wp:paragraph --><p>Body text.</p><!-- /wp:paragraph -->';

interface AdminPostShape {
  id: string;
  content: string;
  structureLocked: boolean;
  version: number;
}

describe('block structure signature', () => {
  it('ignores text changes but detects names, attributes and nesting', () => {
    expect(structureUnchanged(BASE_CONTENT, TEXT_ONLY)).toBe(true);
    expect(structureUnchanged(BASE_CONTENT, CHANGED_ATTRS)).toBe(false);
    expect(structureUnchanged(BASE_CONTENT, ADDED_BLOCK)).toBe(false);
    expect(structureSignature(BASE_CONTENT)).toBe(structureSignature(TEXT_ONLY));
  });
});

describe('safe client editing (structure lock)', () => {
  let app: FastifyInstance;
  let adminHeaders: Record<string, string>;
  let adminCookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = session.cookieHeader;
    adminHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app.close();
  });

  async function createPublished(
    headers: Record<string, string>,
    title: string,
  ): Promise<AdminPostShape> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: { type: 'post', title, content: BASE_CONTENT },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPostShape;
    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(published.statusCode).toBe(200);
    return published.json() as AdminPostShape;
  }

  it('allows text edits but rejects structural edits while locked', async () => {
    const post = await createPublished(adminHeaders, 'Structure lock target');

    const locked = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: { baseVersion: post.version, structureLocked: true },
    });
    expect(locked.statusCode).toBe(200);
    const lockedPost = locked.json() as AdminPostShape;
    expect(lockedPost.structureLocked).toBe(true);

    const textEdit = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: { baseVersion: lockedPost.version, content: TEXT_ONLY },
    });
    expect(textEdit.statusCode).toBe(200);
    const afterText = textEdit.json() as AdminPostShape;
    expect(afterText.content).toContain('Rewritten title');

    for (const [label, content] of [
      ['added block', ADDED_BLOCK],
      ['changed attributes', CHANGED_ATTRS],
    ] as const) {
      const rejected = await app.inject({
        method: 'PATCH',
        url: `/api/admin/posts/${post.id}`,
        headers: adminHeaders,
        payload: { baseVersion: afterText.version, content },
      });
      expect(rejected.statusCode, label).toBe(409);
      expect((rejected.json() as { error: { code: string } }).error.code).toBe('STRUCTURE_LOCKED');

      const read = await app.inject({
        method: 'GET',
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie: adminCookie },
      });
      // The rejected write never reached the row.
      expect((read.json() as AdminPostShape).content).toBe(TEXT_ONLY);
      expect((read.json() as AdminPostShape).version).toBe(afterText.version);
    }

    // Non-content fields remain editable while locked.
    const titleOnly = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: { baseVersion: afterText.version, title: 'Renamed while locked' },
    });
    expect(titleOnly.statusCode).toBe(200);

    const unlocked = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: {
        baseVersion: (titleOnly.json() as AdminPostShape).version,
        structureLocked: false,
      },
    });
    expect(unlocked.statusCode).toBe(200);

    const structural = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: {
        baseVersion: (unlocked.json() as AdminPostShape).version,
        content: ADDED_BLOCK,
      },
    });
    expect(structural.statusCode).toBe(200);
    expect((structural.json() as AdminPostShape).content).toContain('Extra block.');
  });

  it('only lets users with edit-any change the lock', async () => {
    const author = await seedUser(app, {
      username: 'lock-author',
      password: 'Author-pass-2026!',
      role: 'author',
    });
    const session = await loginAs(app, 'lock-author', 'Author-pass-2026!');
    const authorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: authorHeaders,
      payload: { type: 'post', title: 'Author structure post', content: BASE_CONTENT },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPostShape;

    const forbidden = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: authorHeaders,
      payload: { baseVersion: post.version, structureLocked: true },
    });
    expect(forbidden.statusCode).toBe(403);
    expect((forbidden.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    // An administrator locks it; the author can still edit text but not structure.
    const locked = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: { baseVersion: post.version, structureLocked: true },
    });
    expect(locked.statusCode).toBe(200);
    const lockedVersion = (locked.json() as AdminPostShape).version;

    const text = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: authorHeaders,
      payload: { baseVersion: lockedVersion, content: TEXT_ONLY },
    });
    expect(text.statusCode).toBe(200);

    const structural = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: authorHeaders,
      payload: {
        baseVersion: (text.json() as AdminPostShape).version,
        content: ADDED_BLOCK,
      },
    });
    expect(structural.statusCode).toBe(409);
    expect(author.id).toBeTruthy();
  });
});
