import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  loginAs,
  seedAdmin,
  seedUser,
} from '../helpers/auth.js';
import { closeMediaTestApp, createMediaTestApp } from './helpers.js';

interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

interface MediaShape {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  caption: string;
  description: string;
  url: string;
  derivatives: { '300': string; '600': string; '1200': string };
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MediaListShape {
  items: MediaShape[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

interface TestFile {
  filename: string;
  contentType: string;
  data: Buffer;
  field?: string;
}

interface Session {
  cookie: string;
  csrf: string;
}

const USER_PASSWORD = 'Author horse battery staple';

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>',
  'utf8',
);
/** Smallest valid GIF89a (1×1 transparent). */
const GIF_STUB = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function multipartPayload(
  file: TestFile,
  fields: Record<string, string>,
): { body: Buffer; contentType: string } {
  const boundary = `----mernpress-test-${randomBytes(8).toString('hex')}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'file'}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      'utf8',
    ),
  );
  chunks.push(file.data);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Recursively locate a stored upload by its file name. */
async function findStoredFile(root: string, fileName: string): Promise<string> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === fileName) {
      return path.join(entry.parentPath, entry.name);
    }
  }
  throw new Error(`stored file not found: ${fileName}`);
}

describe('admin media library', () => {
  let app: FastifyInstance;
  let storageRoot: string;
  let adminCookie: string;
  let adminCsrf: string;
  let adminId: string;

  let png: Buffer;
  let jpeg: Buffer;
  let webp: Buffer;
  let widePng: Buffer;
  let hugePng: Buffer;

  beforeAll(async () => {
    png = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .png()
      .toBuffer();
    jpeg = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 200, g: 30, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    webp = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 40, g: 200, b: 90 } },
    })
      .webp()
      .toBuffer();
    widePng = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 90, g: 90, b: 200 } },
    })
      .png()
      .toBuffer();
    hugePng = await sharp({
      create: { width: 3000, height: 1200, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer();
  });

  beforeEach(async () => {
    const context = await createMediaTestApp();
    app = context.app;
    storageRoot = context.storageRoot;
    const admin = await seedAdmin(app);
    adminId = admin.id;
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = session.cookieHeader;
    adminCsrf = session.csrfToken;
  });

  afterEach(async () => {
    await closeMediaTestApp({ app, storageRoot });
  });

  function adminHeaders(): Record<string, string> {
    return { cookie: adminCookie, 'x-csrf-token': adminCsrf, origin: ADMIN_ORIGIN };
  }

  async function uploadRaw(
    file: TestFile,
    headers: Record<string, string>,
    fields: Record<string, string> = {},
  ) {
    const { body, contentType } = multipartPayload(file, fields);
    return app.inject({
      method: 'POST',
      url: '/api/admin/media',
      headers: { ...headers, 'content-type': contentType },
      payload: body,
    });
  }

  function uploadAsAdmin(
    file: TestFile,
    fields: Record<string, string> = {},
    headers: Record<string, string> = adminHeaders(),
  ) {
    return uploadRaw(file, headers, fields);
  }

  async function createMedia(
    file: TestFile,
    fields: Record<string, string> = {},
  ): Promise<MediaShape> {
    const response = await uploadAsAdmin(file, fields);
    if (response.statusCode !== 201) {
      throw new Error(`upload failed: ${response.statusCode} ${response.body}`);
    }
    return response.json() as MediaShape;
  }

  async function createSession(username: string, role: Parameters<typeof seedUser>[1]['role']) {
    const user = await seedUser(app, { username, password: USER_PASSWORD, role });
    const session = await loginAs(app, username, USER_PASSWORD);
    const result: Session = { cookie: session.cookieHeader, csrf: session.csrfToken };
    return { user, session: result };
  }

  function sessionHeaders(session: Session): Record<string, string> {
    return { cookie: session.cookie, 'x-csrf-token': session.csrf, origin: ADMIN_ORIGIN };
  }

  describe('upload', () => {
    it('re-encodes a png to webp and returns the media DTO', async () => {
      const response = await uploadAsAdmin(
        { filename: 'Beach Sunset.png', contentType: 'image/png', data: png },
        { altText: 'A beach at sunset', caption: 'Golden hour' },
      );

      expect(response.statusCode).toBe(201);
      const media = response.json() as MediaShape;
      expect(media.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(media.fileName).toMatch(/^[0-9a-f]{16}\.webp$/);
      expect(media.originalName).toBe('Beach Sunset.png');
      expect(media.mimeType).toBe('image/webp');
      expect(media.width).toBe(120);
      expect(media.height).toBe(80);
      expect(media.sizeBytes).toBeGreaterThan(0);
      expect(media.altText).toBe('A beach at sunset');
      expect(media.caption).toBe('Golden hour');
      expect(media.description).toBe('');
      expect(media.uploadedById).toBe(adminId);
      expect(media.url).toBe(`/api/media/${media.id}/${media.fileName}`);
      expect(media.derivatives['300']).toBe(
        `/api/media/${media.id}/${media.fileName.replace(/\.webp$/, '-300.webp')}`,
      );
      expect(media.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Stored under <root>/<YYYY>/<MM>/ and served as WebP.
      const storedPath = await findStoredFile(storageRoot, media.fileName);
      expect(path.relative(storageRoot, storedPath)).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/);
      const metadata = await sharp(await readFile(storedPath)).metadata();
      expect(metadata.format).toBe('webp');
    });

    it('caps the canonical image inside 2560×2560 without enlarging', async () => {
      const media = await createMedia({
        filename: 'huge.png',
        contentType: 'image/png',
        data: hugePng,
      });
      expect(media.width).toBe(2560);
      expect(media.height).toBeLessThanOrEqual(2560);
      expect(media.width).toBeLessThan(3000);
    });

    it('generates real 300/600/1200 derivatives', async () => {
      const media = await createMedia({
        filename: 'wide.png',
        contentType: 'image/png',
        data: widePng,
      });

      for (const width of [300, 600, 1200] as const) {
        const url = media.derivatives[String(width) as '300' | '600' | '1200'];
        const name = url.split('/').pop() ?? '';
        expect(name).toBe(media.fileName.replace(/\.webp$/, `-${width}.webp`));
        const storedPath = await findStoredFile(storageRoot, name);
        const metadata = await sharp(await readFile(storedPath)).metadata();
        expect(metadata.format).toBe('webp');
        expect(metadata.width).toBe(width);
        expect(metadata.height).toBe(Math.round((900 * width) / 1600));
      }
    });

    it.each([
      {
        label: 'jpeg',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        get data() {
          return jpeg;
        },
      },
      {
        label: 'webp',
        filename: 'photo.webp',
        contentType: 'image/webp',
        get data() {
          return webp;
        },
      },
      {
        label: 'gif',
        filename: 'pixel.gif',
        contentType: 'image/gif',
        get data() {
          return GIF_STUB;
        },
      },
    ])('accepts $label and stores it as a static webp', async ({ filename, contentType, data }) => {
      const media = await createMedia({ filename, contentType, data });
      expect(media.mimeType).toBe('image/webp');

      const storedPath = await findStoredFile(storageRoot, media.fileName);
      const metadata = await sharp(await readFile(storedPath)).metadata();
      expect(metadata.format).toBe('webp');
      // Animated sources are flattened to the first frame (no animation out).
      expect(metadata.pages ?? 1).toBe(1);
    });

    it('rejects an SVG renamed to .png', async () => {
      const response = await uploadAsAdmin({
        filename: 'logo.png',
        contentType: 'image/png',
        data: SVG,
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an SVG with its real content type', async () => {
      const response = await uploadAsAdmin({
        filename: 'logo.svg',
        contentType: 'image/svg+xml',
        data: SVG,
      });
      expect(response.statusCode).toBe(400);
    });

    it.each([
      { filename: 'malware.exe', contentType: 'application/octet-stream' },
      { filename: 'notes.txt', contentType: 'text/plain' },
      { filename: 'document.pdf', contentType: 'application/pdf' },
    ])('rejects the disallowed file $filename', async ({ filename, contentType }) => {
      const response = await uploadAsAdmin({ filename, contentType, data: png });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a declared content type that does not match the extension', async () => {
      const response = await uploadAsAdmin({
        filename: 'photo.png',
        contentType: 'image/gif',
        data: png,
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-raster bytes carrying an image content type', async () => {
      const response = await uploadAsAdmin({
        filename: 'fake.png',
        contentType: 'image/png',
        data: Buffer.from('this is definitely not a png', 'utf8'),
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an upload larger than 10 MB', async () => {
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1024, 1);
      const response = await uploadAsAdmin({
        filename: 'huge.png',
        contentType: 'image/png',
        data: oversized,
      });
      expect(response.statusCode).toBe(413);
      expect((response.json() as ErrorEnvelope).error.code).toBe('CONTENT_TOO_LARGE');
    });

    it('rejects a multipart request without a file part', async () => {
      const { body, contentType } = multipartPayload(
        { filename: '', contentType: 'text/plain', data: Buffer.alloc(0), field: 'ignored' },
        { altText: 'no file here' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/media',
        headers: { ...adminHeaders(), 'content-type': contentType },
        payload: body,
      });
      expect(response.statusCode).toBe(400);
    });

    it('requires a session (401)', async () => {
      const response = await uploadAsAdmin(
        { filename: 'photo.png', contentType: 'image/png', data: png },
        {},
        { origin: ADMIN_ORIGIN },
      );
      expect(response.statusCode).toBe(401);
      expect((response.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an unapproved origin (403)', async () => {
      const response = await uploadAsAdmin(
        { filename: 'photo.png', contentType: 'image/png', data: png },
        {},
        { ...adminHeaders(), origin: 'http://evil.example' },
      );
      expect(response.statusCode).toBe(403);
      expect((response.json() as ErrorEnvelope).error.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('requires a CSRF token (403)', async () => {
      const response = await uploadAsAdmin(
        { filename: 'photo.png', contentType: 'image/png', data: png },
        {},
        { cookie: adminCookie, origin: ADMIN_ORIGIN },
      );
      expect(response.statusCode).toBe(403);
      expect((response.json() as ErrorEnvelope).error.code).toBe('CSRF_INVALID');
    });

    it('allows an author and a contributor to upload', async () => {
      const author = await createSession('author-one', 'author');
      const contributor = await createSession('contributor-one', 'contributor');

      const authorUpload = await uploadRaw(
        { filename: 'a.png', contentType: 'image/png', data: png },
        sessionHeaders(author.session),
      );
      expect(authorUpload.statusCode).toBe(201);
      expect((authorUpload.json() as MediaShape).uploadedById).toBe(author.user.id);

      const contributorUpload = await uploadRaw(
        { filename: 'c.png', contentType: 'image/png', data: png },
        sessionHeaders(contributor.session),
      );
      expect(contributorUpload.statusCode).toBe(201);
    });

    it('denies a subscriber (403)', async () => {
      const subscriber = await createSession('subscriber-one', 'subscriber');
      const response = await uploadRaw(
        { filename: 's.png', contentType: 'image/png', data: png },
        sessionHeaders(subscriber.session),
      );
      expect(response.statusCode).toBe(403);
      expect((response.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');
    });
  });

  describe('list', () => {
    it('paginates newest first with bounded perPage', async () => {
      const first = await createMedia({ filename: 'one.png', contentType: 'image/png', data: png });
      const second = await createMedia({
        filename: 'two.png',
        contentType: 'image/png',
        data: jpeg,
      });
      const third = await createMedia({
        filename: 'three.png',
        contentType: 'image/png',
        data: webp,
      });

      const page1 = await app.inject({
        method: 'GET',
        url: '/api/admin/media?page=1&perPage=2',
        headers: { cookie: adminCookie },
      });
      expect(page1.statusCode).toBe(200);
      const firstPage = page1.json() as MediaListShape;
      expect(firstPage.pagination).toEqual({ page: 1, perPage: 2, total: 3, totalPages: 2 });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.items[0]?.id).toBe(third.id);
      expect(firstPage.items[1]?.id).toBe(second.id);

      const page2 = await app.inject({
        method: 'GET',
        url: '/api/admin/media?page=2&perPage=2',
        headers: { cookie: adminCookie },
      });
      const secondPage = page2.json() as MediaListShape;
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.items[0]?.id).toBe(first.id);
    });

    it('defaults to 24 per page and clamps at 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/media',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as MediaListShape).pagination.perPage).toBe(24);

      const tooLarge = await app.inject({
        method: 'GET',
        url: '/api/admin/media?perPage=101',
        headers: { cookie: adminCookie },
      });
      expect(tooLarge.statusCode).toBe(400);
    });

    it('searches file name, original name and alt text', async () => {
      const target = await createMedia(
        { filename: 'Sunset-Beach.png', contentType: 'image/png', data: png },
        { altText: 'A red barn at dusk' },
      );
      await createMedia({ filename: 'unrelated.png', contentType: 'image/png', data: jpeg });

      for (const term of ['sunset-beach', 'barn', target.fileName.slice(0, 10)]) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/admin/media?search=${encodeURIComponent(term)}`,
          headers: { cookie: adminCookie },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json() as MediaListShape;
        expect(body.pagination.total).toBe(1);
        expect(body.items[0]?.id).toBe(target.id);
      }

      const empty = await app.inject({
        method: 'GET',
        url: '/api/admin/media?search=no-such-media',
        headers: { cookie: adminCookie },
      });
      expect((empty.json() as MediaListShape).pagination.total).toBe(0);
    });

    it('accepts type=image and rejects unknown types', async () => {
      await createMedia({ filename: 'one.png', contentType: 'image/png', data: png });

      const images = await app.inject({
        method: 'GET',
        url: '/api/admin/media?type=image',
        headers: { cookie: adminCookie },
      });
      expect(images.statusCode).toBe(200);
      expect((images.json() as MediaListShape).pagination.total).toBe(1);

      const videos = await app.inject({
        method: 'GET',
        url: '/api/admin/media?type=video',
        headers: { cookie: adminCookie },
      });
      expect(videos.statusCode).toBe(400);
    });

    it('denies a subscriber (403)', async () => {
      const subscriber = await createSession('subscriber-two', 'subscriber');
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/media',
        headers: { cookie: subscriber.session.cookie },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('get', () => {
    it('returns one DTO and 404s unknown ids', async () => {
      const created = await createMedia({
        filename: 'one.png',
        contentType: 'image/png',
        data: png,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/media/${created.id}`,
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as MediaShape).id).toBe(created.id);

      const missing = await app.inject({
        method: 'GET',
        url: '/api/admin/media/00000000-0000-4000-8000-000000000000',
        headers: { cookie: adminCookie },
      });
      expect(missing.statusCode).toBe(404);

      const malformed = await app.inject({
        method: 'GET',
        url: '/api/admin/media/not-a-uuid',
        headers: { cookie: adminCookie },
      });
      expect(malformed.statusCode).toBe(400);
    });
  });

  describe('metadata edits', () => {
    it('updates altText, caption and description and allows clearing them', async () => {
      const created = await createMedia(
        { filename: 'one.png', contentType: 'image/png', data: png },
        { altText: 'old alt' },
      );

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/media/${created.id}`,
        headers: { ...adminHeaders(), 'content-type': 'application/json' },
        payload: { altText: 'new alt', caption: 'A caption', description: 'Longer notes' },
      });
      expect(response.statusCode).toBe(200);
      const updated = response.json() as MediaShape;
      expect(updated.altText).toBe('new alt');
      expect(updated.caption).toBe('A caption');
      expect(updated.description).toBe('Longer notes');

      const cleared = await app.inject({
        method: 'PATCH',
        url: `/api/admin/media/${created.id}`,
        headers: { ...adminHeaders(), 'content-type': 'application/json' },
        payload: { altText: '', caption: '', description: '' },
      });
      expect(cleared.statusCode).toBe(200);
      const clearedMedia = cleared.json() as MediaShape;
      expect(clearedMedia.altText).toBe('');
      expect(clearedMedia.caption).toBe('');
      expect(clearedMedia.description).toBe('');
    });

    it('rejects overlong metadata (400)', async () => {
      const created = await createMedia({
        filename: 'one.png',
        contentType: 'image/png',
        data: png,
      });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/media/${created.id}`,
        headers: { ...adminHeaders(), 'content-type': 'application/json' },
        payload: { altText: 'x'.repeat(501) },
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('lets an author edit their own media but not another author’s', async () => {
      const author = await createSession('author-edit', 'author');
      const other = await createSession('author-other', 'author');

      const owned = await uploadRaw(
        { filename: 'mine.png', contentType: 'image/png', data: png },
        sessionHeaders(author.session),
      );
      expect(owned.statusCode).toBe(201);
      const ownedMedia = owned.json() as MediaShape;

      const ownEdit = await app.inject({
        method: 'PATCH',
        url: `/api/admin/media/${ownedMedia.id}`,
        headers: { ...sessionHeaders(author.session), 'content-type': 'application/json' },
        payload: { altText: 'mine' },
      });
      expect(ownEdit.statusCode).toBe(200);

      const foreignEdit = await app.inject({
        method: 'PATCH',
        url: `/api/admin/media/${ownedMedia.id}`,
        headers: { ...sessionHeaders(other.session), 'content-type': 'application/json' },
        payload: { altText: 'not mine' },
      });
      expect(foreignEdit.statusCode).toBe(403);
      expect((foreignEdit.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');
    });

    it('lets an administrator edit any media item', async () => {
      const author = await createSession('author-admin-edit', 'author');
      const owned = await uploadRaw(
        { filename: 'theirs.png', contentType: 'image/png', data: png },
        sessionHeaders(author.session),
      );
      const media = owned.json() as MediaShape;

      const edit = await app.inject({
        method: 'PATCH',
        url: `/api/admin/media/${media.id}`,
        headers: { ...adminHeaders(), 'content-type': 'application/json' },
        payload: { altText: 'edited by admin' },
      });
      expect(edit.statusCode).toBe(200);
      expect((edit.json() as MediaShape).altText).toBe('edited by admin');
    });

    it('denies a subscriber (403)', async () => {
      const created = await createMedia({
        filename: 'one.png',
        contentType: 'image/png',
        data: png,
      });
      const subscriber = await createSession('subscriber-three', 'subscriber');
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/media/${created.id}`,
        headers: { ...sessionHeaders(subscriber.session), 'content-type': 'application/json' },
        payload: { altText: 'nope' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('delete', () => {
    it('deletes the row and the stored files (204) and then 404s', async () => {
      const created = await createMedia({
        filename: 'gone.png',
        contentType: 'image/png',
        data: widePng,
      });
      const mainPath = await findStoredFile(storageRoot, created.fileName);
      const derivativePath = await findStoredFile(
        storageRoot,
        created.fileName.replace(/\.webp$/, '-300.webp'),
      );

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/media/${created.id}`,
        headers: adminHeaders(),
      });
      expect(response.statusCode).toBe(204);

      await expect(readFile(mainPath)).rejects.toThrow();
      await expect(readFile(derivativePath)).rejects.toThrow();

      const after = await app.inject({
        method: 'GET',
        url: `/api/admin/media/${created.id}`,
        headers: { cookie: adminCookie },
      });
      expect(after.statusCode).toBe(404);

      const again = await app.inject({
        method: 'DELETE',
        url: `/api/admin/media/${created.id}`,
        headers: adminHeaders(),
      });
      expect(again.statusCode).toBe(404);
    });

    it('enforces trash capability: own yes for authors, no for contributors, any for admins', async () => {
      const author = await createSession('author-delete', 'author');
      const other = await createSession('author-delete-other', 'author');
      const contributor = await createSession('contributor-delete', 'contributor');
      const adminMedia = await createMedia({
        filename: 'admin.png',
        contentType: 'image/png',
        data: png,
      });

      const authorMedia = (
        await uploadRaw(
          { filename: 'author.png', contentType: 'image/png', data: png },
          sessionHeaders(author.session),
        )
      ).json() as MediaShape;
      const contributorMedia = (
        await uploadRaw(
          { filename: 'contrib.png', contentType: 'image/png', data: png },
          sessionHeaders(contributor.session),
        )
      ).json() as MediaShape;

      const foreign = await app.inject({
        method: 'DELETE',
        url: `/api/admin/media/${adminMedia.id}`,
        headers: sessionHeaders(other.session),
      });
      expect(foreign.statusCode).toBe(403);

      const contributorOwn = await app.inject({
        method: 'DELETE',
        url: `/api/admin/media/${contributorMedia.id}`,
        headers: sessionHeaders(contributor.session),
      });
      expect(contributorOwn.statusCode).toBe(403);

      const own = await app.inject({
        method: 'DELETE',
        url: `/api/admin/media/${authorMedia.id}`,
        headers: sessionHeaders(author.session),
      });
      expect(own.statusCode).toBe(204);

      const adminDeletesAny = await app.inject({
        method: 'DELETE',
        url: `/api/admin/media/${adminMedia.id}`,
        headers: adminHeaders(),
      });
      expect(adminDeletesAny.statusCode).toBe(204);
    });
  });

  describe('public file serving', () => {
    it('serves the canonical file with hardening headers and exact bytes', async () => {
      const created = await createMedia({
        filename: 'one.png',
        contentType: 'image/png',
        data: widePng,
      });
      const storedPath = await findStoredFile(storageRoot, created.fileName);
      const storedBytes = await readFile(storedPath);

      const response = await app.inject({ method: 'GET', url: created.url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['content-length']).toBe(String(storedBytes.length));
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.rawPayload.equals(storedBytes)).toBe(true);

      const head = await app.inject({ method: 'HEAD', url: created.url });
      expect(head.statusCode).toBe(200);
      expect(head.body).toBe('');
      expect(head.headers['content-length']).toBe(String(storedBytes.length));
    });

    it('serves derivatives', async () => {
      const created = await createMedia({
        filename: 'one.png',
        contentType: 'image/png',
        data: widePng,
      });
      const response = await app.inject({ method: 'GET', url: created.derivatives['300'] });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      const metadata = await sharp(response.rawPayload).metadata();
      expect(metadata.width).toBe(300);
    });

    it('404s unknown names, traversal attempts and unknown ids', async () => {
      const created = await createMedia({
        filename: 'one.png',
        contentType: 'image/png',
        data: png,
      });

      const wrongName = await app.inject({
        method: 'GET',
        url: `/api/media/${created.id}/deadbeefdeadbeef.webp`,
      });
      expect(wrongName.statusCode).toBe(404);

      const dotDot = await app.inject({ method: 'GET', url: `/api/media/${created.id}/..` });
      expect(dotDot.statusCode).toBe(404);

      const encodedTraversal = await app.inject({
        method: 'GET',
        url: `/api/media/${created.id}/${encodeURIComponent('../../etc/passwd')}`,
      });
      expect(encodedTraversal.statusCode).toBe(404);

      const absolute = await app.inject({
        method: 'GET',
        url: `/api/media/${created.id}/${encodeURIComponent('/etc/passwd')}`,
      });
      expect(absolute.statusCode).toBe(404);

      const unknownId = await app.inject({
        method: 'GET',
        url: '/api/media/00000000-0000-4000-8000-000000000000/deadbeefdeadbeef.webp',
      });
      expect(unknownId.statusCode).toBe(404);

      const malformedId = await app.inject({
        method: 'GET',
        url: `/api/media/not-a-uuid/${created.fileName}`,
      });
      expect(malformedId.statusCode).toBe(404);
    });

    it('404s a row whose file disappeared from disk', async () => {
      const created = await createMedia({
        filename: 'one.png',
        contentType: 'image/png',
        data: png,
      });
      const { unlink } = await import('node:fs/promises');
      await unlink(await findStoredFile(storageRoot, created.fileName));

      const response = await app.inject({ method: 'GET', url: created.url });
      expect(response.statusCode).toBe(404);
    });
  });
});
