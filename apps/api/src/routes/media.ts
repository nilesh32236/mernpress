import multipart from '@fastify/multipart';
import {
  ContentError,
  MEDIA_MAX_UPLOAD_BYTES,
  type AuthService,
  type MediaDto,
  type MediaService,
} from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const uuid = z.string().uuid();
const mediaIdParamSchema = z.object({ id: uuid }).strict();

/**
 * Public file names are generated (`<16 hex>.webp`, `<16 hex>-300.webp`, …). The
 * charset check is defence in depth; the allow-list check in the service is the
 * authoritative one.
 */
const publicFileParamSchema = z
  .object({
    id: uuid,
    name: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9._-]+$/),
  })
  .strict();

const listMediaQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(24),
    search: z.string().max(200).optional(),
    type: z.enum(['image']).optional(),
    order: z.enum(['newest', 'oldest']).optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
      .optional(),
    folder: z.union([uuid, z.literal('none')]).optional(),
  })
  .strict();

/** PATCH carries metadata only; empty strings are valid (they clear the field). */
const updateMediaSchema = z
  .object({
    altText: z.string().max(500).optional(),
    caption: z.string().max(2000).optional(),
    description: z.string().max(10_000).optional(),
    folderId: uuid.nullable().optional(),
  })
  .strict();

const folderNameSchema = z.string().trim().min(1).max(100);
const folderIdParamSchema = z.object({ id: uuid }).strict();
const folderBodySchema = z.object({ name: folderNameSchema }).strict();
const folderCreateSchema = z
  .object({ name: folderNameSchema, parentId: uuid.nullable().optional() })
  .strict();
const folderMoveSchema = z.object({ parentId: uuid.nullable() }).strict();

const regenerateSchema = z
  .object({
    after: uuid.optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const uploadFieldSchema = z.object({
  altText: z.string().max(500).optional(),
  caption: z.string().max(2000).optional(),
  description: z.string().max(10_000).optional(),
  folderId: uuid.optional(),
});

const UPLOAD_FIELDS = new Set(['altText', 'caption', 'description', 'folderId']);

const MULTIPART_LIMITS = {
  /** Enforced by the parser and re-checked by the service. */
  fileSize: MEDIA_MAX_UPLOAD_BYTES,
  files: 1,
  fields: 8,
  parts: 12,
  fieldSize: 12_000,
  throwFileSizeLimit: true,
} as const;

/** One registration per Fastify instance, however often the route is mounted. */
const multipartApps = new WeakSet<FastifyInstance>();

function ensureMultipart(app: FastifyInstance): void {
  if (multipartApps.has(app)) {
    return;
  }
  multipartApps.add(app);
  void app.register(multipart, { limits: { ...MULTIPART_LIMITS } });
}

function isFileTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE'
  );
}

/** Parser limit violations become the same typed error the service raises. */
function mapUploadError(error: unknown): unknown {
  if (isFileTooLarge(error)) {
    return new ContentError('CONTENT_TOO_LARGE', 'File too large', 413);
  }
  return error;
}

export interface MediaRouteOptions {
  env: Env;
  auth: AuthService;
  media: MediaService;
  /**
   * Absolute uploads root. The media service owns path resolution, so the route
   * only carries it through for the composition root / tests.
   */
  storageRoot: string;
}

/**
 * Media library routes (Phase 6).
 *
 * Thin adapters: `requireAdmin` authenticates the session (and CSRF for
 * mutations); `MediaService` owns capability checks, decoding, storage and path
 * confinement. The public file route is unauthenticated by design — uploads are
 * only reachable by id + random file name and carry `nosniff` + immutable
 * caching.
 */
export function registerMediaRoutes(app: FastifyInstance, options: MediaRouteOptions): void {
  const { env, auth, media } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  ensureMultipart(app);

  app.post(
    '/api/admin/media',
    { bodyLimit: MEDIA_MAX_UPLOAD_BYTES + 1024 * 1024 },
    async (request, reply) => {
      const ctx = await guard(request, reply);
      if (!ctx) return;
      try {
        if (!request.isMultipart()) {
          throw new ContentError('VALIDATION_ERROR', 'Expected multipart/form-data', 400);
        }

        const fields: Record<string, string> = {};
        let uploaded: { buffer: Buffer; originalName: string; mimeType: string } | null = null;

        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'file' || uploaded !== null) {
              // Drain the stream so the parser can reach the next part.
              await part.toBuffer();
              throw new ContentError('VALIDATION_ERROR', 'Only one file is allowed', 400);
            }
            const buffer = await part.toBuffer();
            if (part.file.truncated) {
              throw new ContentError('CONTENT_TOO_LARGE', 'File too large', 413);
            }
            uploaded = {
              buffer,
              originalName: part.filename ?? '',
              mimeType: part.mimetype,
            };
          } else if (UPLOAD_FIELDS.has(part.fieldname) && typeof part.value === 'string') {
            fields[part.fieldname] = part.value;
          }
        }

        if (uploaded === null) {
          throw new ContentError('VALIDATION_ERROR', 'A file is required', 400);
        }

        const meta = uploadFieldSchema.parse(fields);
        const created: MediaDto = await media.upload(ctx.principal, {
          buffer: uploaded.buffer,
          originalName: uploaded.originalName,
          mimeType: uploaded.mimeType,
          altText: meta.altText ?? '',
          caption: meta.caption ?? '',
          description: meta.description ?? '',
          folderId: meta.folderId ?? null,
        });
        return reply.code(201).send(created);
      } catch (error) {
        return sendRouteError(reply, request, mapUploadError(error));
      }
    },
  );

  app.post(
    '/api/admin/media/:id/edit',
    { bodyLimit: MEDIA_MAX_UPLOAD_BYTES + 1024 * 1024 },
    async (request, reply) => {
      const ctx = await guard(request, reply);
      if (!ctx) return;
      try {
        const { id } = mediaIdParamSchema.parse(request.params);
        if (!request.isMultipart()) {
          throw new ContentError('VALIDATION_ERROR', 'Expected multipart/form-data', 400);
        }
        let uploaded: Buffer | null = null;
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'file' || uploaded !== null) {
              await part.toBuffer();
              throw new ContentError('VALIDATION_ERROR', 'Only one file is allowed', 400);
            }
            uploaded = await part.toBuffer();
            if (part.file.truncated) {
              throw new ContentError('CONTENT_TOO_LARGE', 'File too large', 413);
            }
          } else {
            void part.value;
          }
        }
        if (uploaded === null) {
          throw new ContentError('VALIDATION_ERROR', 'A file is required', 400);
        }
        return await media.editImage(ctx.principal, id, { buffer: uploaded });
      } catch (error) {
        return sendRouteError(reply, request, mapUploadError(error));
      }
    },
  );

  app.get('/api/admin/media/folders', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return { items: await media.listFolders(ctx.principal) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/media/folders', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = folderCreateSchema.parse(request.body);
      const folder = await media.createFolder(ctx.principal, body.name, body.parentId ?? null);
      return reply.code(201).send(folder);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.patch('/api/admin/media/folders/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = folderIdParamSchema.parse(request.params);
      const body = folderBodySchema.parse(request.body);
      return await media.renameFolder(ctx.principal, id, body.name);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/media/folders/:id/move', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = folderIdParamSchema.parse(request.params);
      const body = folderMoveSchema.parse(request.body);
      return await media.moveFolder(ctx.principal, id, body.parentId);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/media/folders/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = folderIdParamSchema.parse(request.params);
      await media.deleteFolder(ctx.principal, id);
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/media/regenerate', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = regenerateSchema.parse(request.body ?? {});
      return await media.regenerateDerivatives(ctx.principal, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/media/:id/restore', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = mediaIdParamSchema.parse(request.params);
      return await media.restoreOriginal(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/media', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = listMediaQuerySchema.parse(request.query);
      return await media.list(ctx.principal, query);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/media/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = mediaIdParamSchema.parse(request.params);
      return await media.get(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.patch('/api/admin/media/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = mediaIdParamSchema.parse(request.params);
      const body = updateMediaSchema.parse(request.body);
      return await media.update(ctx.principal, id, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/media/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = mediaIdParamSchema.parse(request.params);
      await media.remove(ctx.principal, id);
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  // Public, unauthenticated file serving. Invalid ids, unknown names, traversal
  // attempts and missing files all return 404 (never 403) so the route leaks
  // nothing about the library.
  app.get('/api/media/:id/:name', async (request, reply) => {
    try {
      const params = publicFileParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      const file = await media.resolvePublicFile(params.data.id, params.data.name);
      return reply
        .header('content-type', file.mimeType)
        .header('content-length', String(file.sizeBytes))
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'public, max-age=31536000, immutable')
        .send(createReadStream(file.absolutePath));
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
