import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from '../helpers/auth.js';

let app: FastifyInstance;
let headers: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
  const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
  headers = {
    origin: ADMIN_ORIGIN,
    cookie: cookieHeader,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json',
  };
});

afterEach(async () => {
  await app.close();
});

function nestedGroups(depth: number): string {
  const open = Array.from({ length: depth }, () => '<!-- wp:group --><div class="wp-block-group">');
  const close = Array.from({ length: depth }, () => '</div><!-- /wp:group -->');
  return `${open.join('')}<!-- wp:paragraph --><p>Deep</p><!-- /wp:paragraph -->${close.join('')}`;
}

function paragraph(value: string): string {
  return `<!-- wp:paragraph --><p>${value}</p><!-- /wp:paragraph -->`;
}

async function createPost(payload: Record<string, unknown>): Promise<AdminPost> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers,
    payload,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AdminPost;
}

describe('block content validation', () => {
  it('stores WordPress block markup byte-for-byte and returns it unchanged', async () => {
    const content = [
      '<!-- wp:heading {"level":2} -->',
      '<h2 class="wp-block-heading">Title</h2>',
      '<!-- /wp:heading -->',
      '',
      '<!-- wp:paragraph {"align":"center"} -->',
      '<p class="has-text-align-center">Hello <strong>world</strong>.</p>',
      '<!-- /wp:paragraph -->',
      '',
      '<!-- wp:separator /-->',
    ].join('\n');

    const created = await createPost({ type: 'post', title: 'Blocks', content });
    expect(created.content).toBe(content);

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${created.id}`,
      headers,
    });
    expect(fetched.statusCode).toBe(200);
    expect((fetched.json() as AdminPost).content).toBe(content);
  });

  it('accepts unknown and freeform blocks without rewriting them', async () => {
    const content =
      '<!-- wp:acme/widget {"count":3} --><div class="acme">Hi</div><!-- /wp:acme/widget -->\n\n<p>Legacy freeform</p>';

    const created = await createPost({ type: 'post', title: 'Unknown blocks', content });
    expect(created.content).toBe(content);
  });

  it('accepts legacy plain-text content (no block delimiters)', async () => {
    const created = await createPost({
      type: 'post',
      title: 'Legacy',
      content: 'Plain text from before the block editor.',
    });
    expect(created.content).toBe('Plain text from before the block editor.');
  });

  it('accepts nesting exactly at the limit', async () => {
    const created = await createPost({
      type: 'post',
      title: 'Deep but valid',
      content: nestedGroups(19),
    });
    expect(created.content).toContain('Deep');
  });

  it('rejects nesting beyond the limit with a stable error code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: { type: 'post', title: 'Too deep', content: nestedGroups(20) },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('BLOCK_NESTING_TOO_DEEP');
    expect(body.error.message).not.toContain('Prisma');
  });

  it('rejects an update that exceeds the block count limit', async () => {
    const created = await createPost({ type: 'post', title: 'Limit' });
    const content = Array.from({ length: 5_001 }, (_, index) => paragraph(`p${index}`)).join('\n');

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${created.id}`,
      headers,
      payload: { baseVersion: created.version, content },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('TOO_MANY_BLOCKS');

    // The rejected update must not bump the version or persist content.
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${created.id}`,
      headers,
    });
    const post = fetched.json() as AdminPost;
    expect(post.version).toBe(created.version);
    expect(post.content).toBe('');
  });
});
