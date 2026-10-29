import { randomBytes } from 'node:crypto';
import type { Stats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseClient, Prisma } from '@mernpress/database';
import sharp from 'sharp';
import { requireCapability, ownsObject, roleHasCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Paged, Principal } from '../content/types.js';
import {
  MEDIA_ALLOWED_EXTENSIONS,
  MEDIA_ALLOWED_IMAGE_FORMATS,
  MEDIA_DERIVATIVE_WIDTHS,
  MEDIA_MAIN_MAX_DIMENSION,
  MEDIA_MAX_UPLOAD_BYTES,
  type MediaDerivativeWidth,
  type MediaDerivatives,
  type MediaDto,
  type MediaFile,
  type MediaListQuery,
  type MediaService,
  type UpdateMediaInput,
  type UploadMediaInput,
} from './types.js';

/** Decoding cap: a 40 MP image is the largest we are willing to allocate. */
const LIMIT_INPUT_PIXELS = 40_000_000;

/** Main image WebP quality; derivatives are cheaper per byte. */
const MAIN_WEBP_QUALITY = 85;
const DERIVATIVE_WEBP_QUALITY = 80;

/** Random base names: 8 bytes → 16 hex chars. Unique enough to be content-addressed in practice. */
const NAME_RANDOM_BYTES = 8;
const NAME_ALLOCATION_ATTEMPTS = 5;

/** Field length ceilings, mirrored by the route schema and the database columns. */
const ALT_TEXT_MAX = 500;
const CAPTION_MAX = 2000;
const DESCRIPTION_MAX = 10_000;

/** Declared content types accepted per extension (multipart aliases included). */
const EXTENSION_MIME_TYPES: Readonly<Record<string, readonly string[]>> = {
  jpg: ['image/jpeg', 'image/jpg'],
  jpeg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
  gif: ['image/gif'],
};

const SERVED_MIME_TYPES: Readonly<Record<string, string>> = {
  'image/webp': 'image/webp',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
};

export interface MediaServiceOptions {
  prisma: DatabaseClient;
  /** Absolute uploads root; the route layer supplies it from configuration. */
  storageRoot: string;
  now?: () => Date;
  logger?: { warn: (message: string, meta?: Record<string, unknown>) => void };
}

/** Structural row shape both Prisma reads and `toMediaDto` agree on. */
interface MediaRow {
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
  storagePath: string;
  derivatives: unknown;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function derivativeKey(width: MediaDerivativeWidth): `${MediaDerivativeWidth}` {
  return `${width}`;
}

/** Narrow the JSON column to `{ "300": "2026/10/x-300.webp", … }`. */
function readDerivatives(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}

function toPublicUrl(id: string, fileName: string): string {
  return `/api/media/${id}/${encodeURIComponent(fileName)}`;
}

function toMediaDto(row: MediaRow): MediaDto {
  const stored = readDerivatives(row.derivatives);
  const base = row.fileName.replace(/\.webp$/i, '');
  const derivatives = {} as MediaDerivatives;
  for (const width of MEDIA_DERIVATIVE_WIDTHS) {
    const key = derivativeKey(width);
    const storedPath = stored[key];
    // Fall back to the naming convention if a legacy row lacks a variant, so the
    // DTO shape stays stable; the serving route still 404s if the file is gone.
    const name =
      storedPath === undefined ? `${base}-${width}.webp` : path.posix.basename(storedPath);
    derivatives[key] = toPublicUrl(row.id, name);
  }
  return {
    id: row.id,
    fileName: row.fileName,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    altText: row.altText,
    caption: row.caption,
    description: row.description,
    url: toPublicUrl(row.id, row.fileName),
    derivatives,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function extensionOf(originalName: string): string | null {
  const extension = path.extname(originalName).toLowerCase().replace(/^\./, '');
  return extension.length === 0 ? null : extension;
}

function isAllowedExtension(extension: string): boolean {
  return (MEDIA_ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
}

/** Object-level authorization: `.any`, or `.own` on an owned row (ADR 0004). */
function canEditMedia(principal: Principal, uploadedById: string | null): void {
  if (roleHasCapability(principal.role, 'content.edit.any')) {
    return;
  }
  if (
    roleHasCapability(principal.role, 'content.edit.own') &&
    ownsObject(principal, uploadedById)
  ) {
    return;
  }
  throw new ContentError('FORBIDDEN', 'Forbidden', 403);
}

function canDeleteMedia(principal: Principal, uploadedById: string | null): void {
  if (roleHasCapability(principal.role, 'content.trash.any')) {
    return;
  }
  if (
    roleHasCapability(principal.role, 'content.trash.own') &&
    ownsObject(principal, uploadedById)
  ) {
    return;
  }
  throw new ContentError('FORBIDDEN', 'Forbidden', 403);
}

function notFound(): ContentError {
  return new ContentError('NOT_FOUND', 'Not found', 404);
}

function invalidImage(): ContentError {
  return new ContentError('VALIDATION_ERROR', 'Unsupported or corrupt image file', 400);
}

async function unlinkQuiet(
  filePath: string,
  logger?: MediaServiceOptions['logger'],
): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger?.warn('failed to remove a media file', { filePath });
    }
  }
}

export function createMediaService(options: MediaServiceOptions): MediaService {
  const { prisma } = options;
  const storageRoot = path.resolve(options.storageRoot);
  const logger = options.logger;
  const now = options.now ?? (() => new Date());

  async function inspectImage(buffer: Buffer): Promise<{ width: number; height: number }> {
    let format: string | undefined;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const metadata = await sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
      format = metadata.format;
      width = metadata.width;
      height = metadata.height;
    } catch {
      // sharp cannot decode the bytes at all (text, pdf, truncated data, …).
      throw invalidImage();
    }
    const isRaster =
      format !== undefined && (MEDIA_ALLOWED_IMAGE_FORMATS as readonly string[]).includes(format);
    if (!isRaster || width === undefined || height === undefined) {
      // SVG has a decodable size in librsvg but is deliberately not allowed.
      throw invalidImage();
    }
    return { width, height };
  }

  function validateDeclaredType(originalName: string, mimeType: string): void {
    if (originalName.length === 0 || originalName.length > 255) {
      throw new ContentError('VALIDATION_ERROR', 'Invalid file name', 400);
    }
    const extension = extensionOf(originalName);
    if (extension === null || !isAllowedExtension(extension)) {
      throw new ContentError('VALIDATION_ERROR', 'Unsupported file type', 400);
    }
    const accepted = EXTENSION_MIME_TYPES[extension] ?? [];
    if (!accepted.includes(mimeType.trim().toLowerCase())) {
      throw new ContentError('VALIDATION_ERROR', 'File type does not match its extension', 400);
    }
  }

  function validateText(label: string, value: string, max: number): void {
    if (value.length > max) {
      throw new ContentError('VALIDATION_ERROR', `Invalid ${label}`, 400);
    }
  }

  /** Reserve a unique `<16 hex>.webp` base name inside `dir`, atomically. */
  async function reserveBaseName(dir: string): Promise<string> {
    for (let attempt = 0; attempt < NAME_ALLOCATION_ATTEMPTS; attempt += 1) {
      const base = randomBytes(NAME_RANDOM_BYTES).toString('hex');
      try {
        const handle = await fs.open(path.join(dir, `${base}.webp`), 'wx');
        await handle.close();
        return base;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
    throw new Error('Could not allocate a media storage name');
  }

  async function upload(principal: Principal, input: UploadMediaInput): Promise<MediaDto> {
    requireCapability(principal, 'content.create');
    validateDeclaredType(input.originalName, input.mimeType);

    if (input.buffer.length === 0) {
      throw new ContentError('VALIDATION_ERROR', 'The uploaded file is empty', 400);
    }
    if (input.buffer.length > MEDIA_MAX_UPLOAD_BYTES) {
      throw new ContentError('CONTENT_TOO_LARGE', 'File too large', 413);
    }

    const altText = input.altText ?? '';
    const caption = input.caption ?? '';
    const description = input.description ?? '';
    validateText('alt text', altText, ALT_TEXT_MAX);
    validateText('caption', caption, CAPTION_MAX);
    validateText('description', description, DESCRIPTION_MAX);

    // Sniff the real format before writing anything to disk.
    await inspectImage(input.buffer);

    const uploadedAt = now();
    const year = String(uploadedAt.getUTCFullYear());
    const month = String(uploadedAt.getUTCMonth() + 1).padStart(2, '0');
    const dir = path.join(storageRoot, year, month);
    await fs.mkdir(dir, { recursive: true });

    const base = await reserveBaseName(dir);
    const fileName = `${base}.webp`;
    const mainPath = path.join(dir, fileName);
    const derivativePaths: string[] = [];

    let width: number;
    let height: number;
    let sizeBytes: number;
    const derivatives: Record<string, string> = {};

    try {
      const info = await sharp(input.buffer, { limitInputPixels: LIMIT_INPUT_PIXELS })
        // `.rotate()` applies the EXIF orientation and drops the metadata block:
        // the re-encoded WebP never carries GPS/camera EXIF (threat model T-12).
        .rotate()
        .resize({
          width: MEDIA_MAIN_MAX_DIMENSION,
          height: MEDIA_MAIN_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: MAIN_WEBP_QUALITY })
        .toFile(mainPath);

      if (info.width === undefined || info.height === undefined) {
        throw invalidImage();
      }
      width = info.width;
      height = info.height;

      for (const derivativeWidth of MEDIA_DERIVATIVE_WIDTHS) {
        const derivativeName = `${base}-${derivativeWidth}.webp`;
        const derivativePath = path.join(dir, derivativeName);
        derivativePaths.push(derivativePath);
        await sharp(mainPath)
          .resize({ width: derivativeWidth, withoutEnlargement: true })
          .webp({ quality: DERIVATIVE_WEBP_QUALITY })
          .toFile(derivativePath);
        derivatives[derivativeKey(derivativeWidth)] = `${year}/${month}/${derivativeName}`;
      }

      const stats = await fs.stat(mainPath);
      sizeBytes = stats.size;
    } catch (error) {
      await unlinkQuiet(mainPath, logger);
      for (const derivativePath of derivativePaths) {
        await unlinkQuiet(derivativePath, logger);
      }
      if (error instanceof ContentError) {
        throw error;
      }
      logger?.warn('media processing failed', {
        originalName: input.originalName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ContentError('VALIDATION_ERROR', 'Failed to process image file', 400);
    }

    try {
      const row = await prisma.mediaItem.create({
        data: {
          fileName,
          originalName: input.originalName,
          mimeType: 'image/webp',
          sizeBytes,
          width,
          height,
          altText,
          caption,
          description,
          storagePath: `${year}/${month}/${fileName}`,
          derivatives,
          uploadedById: principal.userId,
        },
      });
      return toMediaDto(row);
    } catch (error) {
      // The row is authoritative; never leave orphaned files behind a failed insert.
      await unlinkQuiet(mainPath, logger);
      for (const derivativePath of derivativePaths) {
        await unlinkQuiet(derivativePath, logger);
      }
      throw error;
    }
  }

  async function list(principal: Principal, query: MediaListQuery): Promise<Paged<MediaDto>> {
    requireCapability(principal, 'content.read.any');

    const where: Prisma.MediaItemWhereInput = {};
    if (query.type === 'image') {
      where.mimeType = { startsWith: 'image/' };
    }
    const search = query.search?.trim();
    if (search !== undefined && search.length > 0) {
      where.OR = [
        { fileName: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
        { altText: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await prisma.$transaction([
      prisma.mediaItem.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.mediaItem.count({ where }),
    ]);

    return {
      items: rows.map((row) => toMediaDto(row)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async function get(principal: Principal, id: string): Promise<MediaDto> {
    requireCapability(principal, 'content.read.any');
    const row = await prisma.mediaItem.findUnique({ where: { id } });
    if (!row) {
      throw notFound();
    }
    return toMediaDto(row);
  }

  async function update(
    principal: Principal,
    id: string,
    input: UpdateMediaInput,
  ): Promise<MediaDto> {
    const existing = await prisma.mediaItem.findUnique({ where: { id } });
    if (!existing) {
      throw notFound();
    }
    canEditMedia(principal, existing.uploadedById);

    const altText = input.altText ?? existing.altText;
    const caption = input.caption ?? existing.caption;
    const description = input.description ?? existing.description;
    validateText('alt text', altText, ALT_TEXT_MAX);
    validateText('caption', caption, CAPTION_MAX);
    validateText('description', description, DESCRIPTION_MAX);

    const row = await prisma.mediaItem.update({
      where: { id },
      data: { altText, caption, description },
    });
    return toMediaDto(row);
  }

  async function remove(principal: Principal, id: string): Promise<void> {
    const existing = await prisma.mediaItem.findUnique({
      where: { id },
      select: { id: true, uploadedById: true, storagePath: true, derivatives: true },
    });
    if (!existing) {
      throw notFound();
    }
    canDeleteMedia(principal, existing.uploadedById);

    // The database row is authoritative: delete it first, then reclaim files.
    // A failed unlink must not resurrect the row (files are garbage-collected by
    // a later sweep if this process dies mid-delete).
    try {
      await prisma.mediaItem.delete({ where: { id } });
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2025') {
        throw notFound();
      }
      throw error;
    }

    const stored = readDerivatives(existing.derivatives);
    const relativePaths = [existing.storagePath, ...Object.values(stored)];
    for (const relativePath of relativePaths) {
      const absolutePath = path.resolve(storageRoot, relativePath);
      if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) {
        continue;
      }
      await unlinkQuiet(absolutePath, logger);
    }
  }

  async function resolvePublicFile(id: string, name: string): Promise<MediaFile> {
    const row = await prisma.mediaItem.findUnique({
      where: { id },
      select: { fileName: true, mimeType: true, storagePath: true, derivatives: true },
    });
    if (!row) {
      throw notFound();
    }

    // Allow-list by stored basename only: the request can never name an
    // arbitrary path, a sibling row's file or a directory.
    const allowed = new Map<string, string>();
    allowed.set(path.posix.basename(row.storagePath), row.storagePath);
    for (const derivative of Object.values(readDerivatives(row.derivatives))) {
      allowed.set(path.posix.basename(derivative), derivative);
    }

    const relativePath = allowed.get(name);
    if (relativePath === undefined) {
      throw notFound();
    }

    const absolutePath = path.resolve(storageRoot, relativePath);
    // Confinement check as defence in depth even though the allow-list already
    // contains only generated relative paths.
    if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw notFound();
    }

    let stats: Stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch {
      throw notFound();
    }
    if (!stats.isFile()) {
      throw notFound();
    }

    return {
      absolutePath,
      // Rows always store WebP; fall back to a non-executable type for outliers.
      mimeType: SERVED_MIME_TYPES[row.mimeType] ?? 'application/octet-stream',
      sizeBytes: stats.size,
    };
  }

  return { upload, list, get, update, remove, resolvePublicFile };
}
