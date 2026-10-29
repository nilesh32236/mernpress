import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { AdminPost, MediaDto, PublicPost } from '@mernpress/cms-core';
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
  app = await createTestApp({
    MEDIA_STORAGE_DIR: mkdtempSync(path.join(tmpdir(), 'mernpress-fm-media-')),
  });
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

async function createPost(): Promise<AdminPost> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers,
    payload: { type: 'post', title: 'Featured media post' },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AdminPost;
}

async function uploadImage(): Promise<MediaDto> {
  const png = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
  const boundary = '----featuredtest';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="featured.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/media',
    headers: {
      origin: ADMIN_ORIGIN,
      cookie: headers['cookie'] ?? '',
      'x-csrf-token': headers['x-csrf-token'] ?? '',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as MediaDto;
}

describe('featured image on posts', () => {
  it('sets, reads and clears the featured image; public view exposes it', async () => {
    const post = await createPost();
    const media = await uploadImage();

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, featuredMediaId: media.id },
    });
    expect(updated.statusCode).toBe(200);
    const adminPost = updated.json() as AdminPost;
    expect(adminPost.featuredMedia?.id).toBe(media.id);
    expect(adminPost.featuredMedia?.url).toBe(media.url);
    expect(adminPost.featuredMedia?.derivatives['300']).toContain('-300');

    // Publish and read the public view.
    const version = (await app.database.post.findUnique({ where: { id: post.id } }))?.version;
    await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: version },
    });
    const publicView = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    const publicPost = publicView.json() as PublicPost;
    expect(publicPost.featuredImage?.id).toBe(media.id);
    expect(publicPost.featuredImage?.url).toBe(media.url);

    // Clear it.
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: version! + 1, featuredMediaId: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect((cleared.json() as AdminPost).featuredMedia).toBeNull();
  });

  it('rejects a nonexistent media id with 404', async () => {
    const post = await createPost();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, featuredMediaId: crypto.randomUUID() },
    });
    expect(response.statusCode).toBe(404);
  });

  it('omitted featuredMediaId leaves the current image untouched', async () => {
    const post = await createPost();
    const media = await uploadImage();
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, featuredMediaId: media.id },
    });
    const version = (await app.database.post.findUnique({ where: { id: post.id } }))?.version;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: version, title: 'Renamed' },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as AdminPost).featuredMedia?.id).toBe(media.id);
  });

  it('deleting the media item nulls the post featured image (SetNull)', async () => {
    const post = await createPost();
    const media = await uploadImage();
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, featuredMediaId: media.id },
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/admin/media/${media.id}`,
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: headers['cookie'] ?? '',
        'x-csrf-token': headers['x-csrf-token'] ?? '',
      },
    });
    expect(deleted.statusCode).toBe(204);

    const row = await app.database.post.findUnique({ where: { id: post.id } });
    expect(row?.featuredMediaId).toBeNull();
  });
});
