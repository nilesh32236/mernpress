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
  MEDIA_AVIF_QUALITY,
  MEDIA_DERIVATIVE_WIDTHS,
  MEDIA_MAIN_MAX_DIMENSION,
  MEDIA_MAX_UPLOAD_BYTES,
  type EditMediaInput,
  type MediaDerivativeWidth,
  type MediaDerivatives,
  type MediaDto,
  type MediaFile,
  type MediaFolderDto,
  type MediaListQuery,
  type MediaService,
  type RegenerateMediaInput,
  type RegenerateMediaResult,
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
  'image/avif': 'image/avif',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
};

/** Derivatives are served with the type of the file that is actually sent. */
const SERVED_EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
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
  folderId: string | null;
  editedAt: Date | null;
  originalPath: string | null;
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
  const derivatives: MediaDerivatives = {};
  for (const [key, storedPath] of Object.entries(stored)) {
    derivatives[key] = toPublicUrl(row.id, path.posix.basename(storedPath));
  }
  for (const width of MEDIA_DERIVATIVE_WIDTHS) {
    const key = derivativeKey(width);
    if (derivatives[key]) continue;
    // Fall back to the naming convention if a legacy row lacks a variant, so the
    // DTO shape stays stable; the serving route still 404s if the file is gone.
    derivatives[key] = toPublicUrl(row.id, `${base}-${width}.webp`);
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
    folderId: row.folderId,
    editedAt: row.editedAt?.toISOString() ?? null,
    hasOriginal: row.originalPath !== null,
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

  async function setting(key: string, fallback: number): Promise<number> {
    const row = await prisma.option.findUnique({ where: { key } });
    if (!row) return fallback;
    try {
      const value = JSON.parse(row.value);
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  async function boolSetting(key: string, fallback: boolean): Promise<boolean> {
    const row = await prisma.option.findUnique({ where: { key } });
    if (!row) return fallback;
    try {
      const value = JSON.parse(row.value);
      return typeof value === 'boolean' ? value : fallback;
    } catch {
      return fallback;
    }
  }

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

  async function configuredDerivativeSizes(): Promise<
    Map<string, { width: number; height: number; crop: boolean }>
  > {
    const configured = new Map<string, { width: number; height: number; crop: boolean }>();
    const thumbnailW = await setting('thumbnail_size_w', 150);
    const thumbnailH = await setting('thumbnail_size_h', 150);
    const thumbnailCrop = await boolSetting('thumbnail_crop', true);
    if (thumbnailW > 0 || thumbnailH > 0) {
      configured.set(`${thumbnailW}x${thumbnailH}`, {
        width: thumbnailW,
        height: thumbnailH,
        crop: thumbnailCrop,
      });
    }
    const mediumW = await setting('medium_size_w', 300);
    const mediumH = await setting('medium_size_h', 300);
    if (mediumW > 0 || mediumH > 0) {
      configured.set(`${mediumW}x${mediumH}`, {
        width: mediumW,
        height: mediumH,
        crop: false,
      });
    }
    const largeW = await setting('large_size_w', 1024);
    const largeH = await setting('large_size_h', 1024);
    if (largeW > 0 || largeH > 0) {
      configured.set(`${largeW}x${largeH}`, {
        width: largeW,
        height: largeH,
        crop: false,
      });
    }
    return configured;
  }

  /** (Re)build every fixed and configured derivative from the canonical file. */
  async function writeDerivatives(
    mainPath: string,
    base: string,
    dir: string,
    relativeDir: string,
  ): Promise<{ derivatives: Record<string, string>; paths: string[] }> {
    const derivatives: Record<string, string> = {};
    const paths: string[] = [];
    for (const derivativeWidth of MEDIA_DERIVATIVE_WIDTHS) {
      const derivativeName = `${base}-${derivativeWidth}.webp`;
      const derivativePath = path.join(dir, derivativeName);
      paths.push(derivativePath);
      await sharp(mainPath)
        .resize({ width: derivativeWidth, withoutEnlargement: true })
        .webp({ quality: DERIVATIVE_WEBP_QUALITY })
        .toFile(derivativePath);
      derivatives[derivativeKey(derivativeWidth)] = `${relativeDir}/${derivativeName}`;
      const avifName = `${base}-${derivativeWidth}.avif`;
      const avifPath = path.join(dir, avifName);
      paths.push(avifPath);
      await sharp(mainPath)
        .resize({ width: derivativeWidth, withoutEnlargement: true })
        .avif({ quality: MEDIA_AVIF_QUALITY })
        .toFile(avifPath);
      derivatives[`${derivativeWidth}:avif`] = `${relativeDir}/${avifName}`;
    }
    for (const [key, size] of await configuredDerivativeSizes()) {
      if (derivatives[key]) continue;
      const derivativeName = `${base}-${key}.webp`;
      const derivativePath = path.join(dir, derivativeName);
      paths.push(derivativePath);
      const resize = {
        ...(size.width > 0 ? { width: size.width } : {}),
        ...(size.height > 0 ? { height: size.height } : {}),
        fit: (size.crop ? 'cover' : 'inside') as 'cover' | 'inside',
        withoutEnlargement: true,
      };
      await sharp(mainPath)
        .resize(resize)
        .webp({ quality: DERIVATIVE_WEBP_QUALITY })
        .toFile(derivativePath);
      derivatives[key] = `${relativeDir}/${derivativeName}`;
      const avifName = `${base}-${key}.avif`;
      const avifPath = path.join(dir, avifName);
      paths.push(avifPath);
      await sharp(mainPath).resize(resize).avif({ quality: MEDIA_AVIF_QUALITY }).toFile(avifPath);
      derivatives[`${key}:avif`] = `${relativeDir}/${avifName}`;
    }
    return { derivatives, paths };
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

      const generated = await writeDerivatives(mainPath, base, dir, `${year}/${month}`);
      derivativePaths.push(...generated.paths);
      Object.assign(derivatives, generated.derivatives);

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
    if (query.folder === 'none') {
      where.folderId = null;
    } else if (query.folder) {
      where.folderId = query.folder;
    }
    if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
      const [year, month] = query.month.split('-').map(Number);
      where.createdAt = {
        gte: new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)),
        lt: new Date(Date.UTC(year ?? 1970, month ?? 1, 1)),
      };
    }

    const [rows, total] = await prisma.$transaction([
      prisma.mediaItem.findMany({
        where,
        orderBy: [
          { createdAt: query.order === 'oldest' ? 'asc' : 'desc' },
          { id: query.order === 'oldest' ? 'asc' : 'desc' },
        ],
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

  function toFolderDto(row: {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { items: number };
  }): MediaFolderDto {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      itemCount: row._count.items,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  function normalizeFolderName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 100) {
      throw new ContentError('VALIDATION_ERROR', 'A folder name must be 1-100 characters.', 400);
    }
    return trimmed;
  }

  // Folder mutations serialize on one advisory lock: cycle checks, name checks
  // and writes must be atomic or two concurrent moves can create a cycle and
  // two case-variant creates can both pass the check.
  const MEDIA_FOLDER_LOCK_KEY = 778_311_004;

  async function lockFolderTree(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${MEDIA_FOLDER_LOCK_KEY} AS bigint))`;
  }

  function isPrismaCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }

  function rethrowFolderError(error: unknown): never {
    if (isPrismaCode(error, 'P2002')) {
      throw new ContentError('FOLDER_EXISTS', 'A folder with that name already exists.', 409);
    }
    if (isPrismaCode(error, 'P2003')) {
      throw new ContentError('FOLDER_PARENT_INVALID', 'That parent folder no longer exists.', 400);
    }
    throw error;
  }

  async function assertFolderNameFree(
    tx: Prisma.TransactionClient,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.mediaFolder.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ContentError('FOLDER_EXISTS', 'A folder with that name already exists.', 409);
    }
  }

  async function listFolders(principal: Principal): Promise<MediaFolderDto[]> {
    requireCapability(principal, 'content.read.any');
    const rows = await prisma.mediaFolder.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return rows.map(toFolderDto);
  }

  /** Validate an optional parent id (null/undefined = top level). */
  async function resolveFolderParent(
    tx: Prisma.TransactionClient,
    parentId: string | null | undefined,
  ): Promise<string | null> {
    if (parentId === undefined || parentId === null) return null;
    const parent = await tx.mediaFolder.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) {
      throw new ContentError('FOLDER_PARENT_INVALID', 'That parent folder no longer exists.', 400);
    }
    return parentId;
  }

  /** Reject moving a folder under itself or one of its descendants. */
  async function assertNoFolderCycle(
    tx: Prisma.TransactionClient,
    id: string,
    parentId: string | null,
  ): Promise<void> {
    if (parentId === null) return;
    if (parentId === id) {
      throw new ContentError('FOLDER_CYCLE', 'A folder cannot be its own parent.', 400);
    }
    const rows = await tx.mediaFolder.findMany({
      select: { id: true, parentId: true },
    });
    const parents = new Map(rows.map((row) => [row.id, row.parentId]));
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor !== null) {
      if (cursor === id) {
        throw new ContentError(
          'FOLDER_CYCLE',
          'A folder cannot be moved inside one of its own descendants.',
          400,
        );
      }
      if (visited.has(cursor)) break;
      visited.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }

  async function createFolder(
    principal: Principal,
    name: string,
    parentId?: string | null,
  ): Promise<MediaFolderDto> {
    requireCapability(principal, 'content.create');
    const normalized = normalizeFolderName(name);
    try {
      const row = await prisma.$transaction(async (tx) => {
        await lockFolderTree(tx);
        await assertFolderNameFree(tx, normalized);
        const parent = await resolveFolderParent(tx, parentId);
        return tx.mediaFolder.create({
          data: { name: normalized, parentId: parent },
          include: { _count: { select: { items: true } } },
        });
      });
      return toFolderDto(row);
    } catch (error) {
      rethrowFolderError(error);
    }
  }

  async function renameFolder(
    principal: Principal,
    id: string,
    name: string,
  ): Promise<MediaFolderDto> {
    requireCapability(principal, 'content.create');
    const normalized = normalizeFolderName(name);
    try {
      const row = await prisma.$transaction(async (tx) => {
        await lockFolderTree(tx);
        const existing = await tx.mediaFolder.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) {
          throw notFound();
        }
        await assertFolderNameFree(tx, normalized, id);
        return tx.mediaFolder.update({
          where: { id },
          data: { name: normalized },
          include: { _count: { select: { items: true } } },
        });
      });
      return toFolderDto(row);
    } catch (error) {
      rethrowFolderError(error);
    }
  }

  async function moveFolder(
    principal: Principal,
    id: string,
    parentId: string | null,
  ): Promise<MediaFolderDto> {
    requireCapability(principal, 'content.create');
    try {
      const row = await prisma.$transaction(async (tx) => {
        await lockFolderTree(tx);
        const existing = await tx.mediaFolder.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) {
          throw notFound();
        }
        const parent = await resolveFolderParent(tx, parentId);
        await assertNoFolderCycle(tx, id, parent);
        return tx.mediaFolder.update({
          where: { id },
          data: { parentId: parent },
          include: { _count: { select: { items: true } } },
        });
      });
      return toFolderDto(row);
    } catch (error) {
      rethrowFolderError(error);
    }
  }

  async function deleteFolder(principal: Principal, id: string): Promise<void> {
    requireCapability(principal, 'content.create');
    // Child folders take the deleted folder's place; media items become
    // Uncategorized through the existing ON DELETE SET NULL foreign key. The
    // lock covers the parent read and the reparent/delete writes.
    try {
      await prisma.$transaction(async (tx) => {
        await lockFolderTree(tx);
        const existing = await tx.mediaFolder.findUnique({
          where: { id },
          select: { id: true, parentId: true },
        });
        if (!existing) {
          throw notFound();
        }
        await tx.mediaFolder.updateMany({
          where: { parentId: id },
          data: { parentId: existing.parentId },
        });
        await tx.mediaFolder.delete({ where: { id } });
      });
    } catch (error) {
      rethrowFolderError(error);
    }
  }

  /**
   * Rebuild every configured derivative from the canonical stored file. This is
   * the capability WordPress leaves to plugins (Regenerate Thumbnails): media
   * uploaded before a size/format change, or imported from elsewhere, can be
   * brought up to date without re-uploading. Batched with an id cursor so a
   * large library neither times out nor holds one transaction for minutes.
   */
  async function regenerateDerivatives(
    principal: Principal,
    input: RegenerateMediaInput = {},
  ): Promise<RegenerateMediaResult> {
    requireCapability(principal, 'content.create');
    const limit = Math.min(50, Math.max(1, Math.trunc(input.limit ?? 20)));
    const rows = await prisma.mediaItem.findMany({
      where: {
        mimeType: { startsWith: 'image/' },
        ...(input.after ? { id: { gt: input.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, fileName: true, storagePath: true },
    });

    let processed = 0;
    let failed = 0;
    let lastId: string | null = null;
    for (const row of rows) {
      lastId = row.id;
      try {
        const mainPath = path.resolve(storageRoot, row.storagePath);
        if (!mainPath.startsWith(`${storageRoot}${path.sep}`)) {
          throw new Error('Stored path is outside the media root');
        }
        const dir = path.dirname(mainPath);
        const base = row.fileName.replace(/\.[^.]+$/, '');
        const relativeDir = path.posix.dirname(row.storagePath);
        const generated = await writeDerivatives(mainPath, base, dir, relativeDir);
        await prisma.mediaItem.update({
          where: { id: row.id },
          data: { derivatives: generated.derivatives as Prisma.InputJsonValue },
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        logger?.warn('media derivative regeneration failed', {
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const remaining =
      lastId === null
        ? 0
        : await prisma.mediaItem.count({
            where: { mimeType: { startsWith: 'image/' }, id: { gt: lastId } },
          });
    return {
      processed,
      failed,
      remaining,
      nextAfter: remaining > 0 ? lastId : null,
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

    if (input.folderId !== undefined && input.folderId !== null) {
      const folder = await prisma.mediaFolder.findUnique({
        where: { id: input.folderId },
        select: { id: true },
      });
      if (!folder) {
        throw new ContentError('VALIDATION_ERROR', 'That folder no longer exists.', 400);
      }
    }

    const row = await prisma.mediaItem.update({
      where: { id },
      data: {
        altText,
        caption,
        description,
        ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
      },
    });
    return toMediaDto(row);
  }

  async function editImage(
    principal: Principal,
    id: string,
    input: EditMediaInput,
  ): Promise<MediaDto> {
    const existing = await prisma.mediaItem.findUnique({ where: { id } });
    if (!existing) {
      throw notFound();
    }
    canEditMedia(principal, existing.uploadedById);

    if (input.buffer.length === 0) {
      throw new ContentError('VALIDATION_ERROR', 'The edited image is empty', 400);
    }
    if (input.buffer.length > MEDIA_MAX_UPLOAD_BYTES) {
      throw new ContentError('CONTENT_TOO_LARGE', 'File too large', 413);
    }
    await inspectImage(input.buffer);

    const mainPath = path.resolve(storageRoot, existing.storagePath);
    if (!mainPath.startsWith(`${storageRoot}${path.sep}`)) {
      throw notFound();
    }
    const dir = path.dirname(mainPath);
    const base = existing.fileName.replace(/\.webp$/i, '');
    const relativeDir = path.posix.dirname(existing.storagePath);
    const backupRelative = `${existing.storagePath}.original`;
    const backupPath = path.resolve(storageRoot, backupRelative);
    const tempPath = path.join(dir, `${base}.edit-${randomBytes(4).toString('hex')}.webp`);

    let info;
    let mainReplaced = false;
    try {
      info = await sharp(input.buffer, { limitInputPixels: LIMIT_INPUT_PIXELS })
        .rotate()
        .resize({
          width: MEDIA_MAIN_MAX_DIMENSION,
          height: MEDIA_MAIN_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: MAIN_WEBP_QUALITY })
        .toFile(tempPath);
      if (info.width === undefined || info.height === undefined) {
        throw invalidImage();
      }

      // Keep the first pre-edit file so "Restore original image" can bring it
      // back, matching WordPress's backup of the untouched upload.
      if (existing.originalPath === null) {
        await fs.copyFile(mainPath, backupPath);
      }
      await fs.rename(tempPath, mainPath);
      mainReplaced = true;

      const generated = await writeDerivatives(mainPath, base, dir, relativeDir);
      const stats = await fs.stat(mainPath);
      const row = await prisma.mediaItem.update({
        where: { id },
        data: {
          width: info.width,
          height: info.height,
          sizeBytes: stats.size,
          mimeType: 'image/webp',
          derivatives: generated.derivatives,
          editedAt: now(),
          originalPath: existing.originalPath ?? backupRelative,
        },
      });
      return toMediaDto(row);
    } catch (error) {
      await unlinkQuiet(tempPath, logger);
      if (mainReplaced) {
        // Leave the media usable even if derivative generation failed midway.
        try {
          await fs.copyFile(backupPath, mainPath);
        } catch {
          logger?.warn('media edit rollback failed', { id });
        }
      }
      if (error instanceof ContentError) {
        throw error;
      }
      logger?.warn('media edit failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ContentError('VALIDATION_ERROR', 'Failed to process image file', 400);
    }
  }

  async function restoreOriginal(principal: Principal, id: string): Promise<MediaDto> {
    const existing = await prisma.mediaItem.findUnique({ where: { id } });
    if (!existing) {
      throw notFound();
    }
    canEditMedia(principal, existing.uploadedById);
    if (existing.originalPath === null) {
      throw new ContentError('VALIDATION_ERROR', 'This image has no original to restore.', 400);
    }

    const mainPath = path.resolve(storageRoot, existing.storagePath);
    const backupPath = path.resolve(storageRoot, existing.originalPath);
    if (
      !mainPath.startsWith(`${storageRoot}${path.sep}`) ||
      !backupPath.startsWith(`${storageRoot}${path.sep}`)
    ) {
      throw notFound();
    }
    const dir = path.dirname(mainPath);
    const base = existing.fileName.replace(/\.webp$/i, '');
    const relativeDir = path.posix.dirname(existing.storagePath);
    const tempPath = path.join(dir, `${base}.restore-${randomBytes(4).toString('hex')}.webp`);

    try {
      await fs.copyFile(backupPath, tempPath);
      const info = await sharp(tempPath, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
      if (info.width === undefined || info.height === undefined) {
        throw invalidImage();
      }
      await fs.rename(tempPath, mainPath);
      const generated = await writeDerivatives(mainPath, base, dir, relativeDir);
      const stats = await fs.stat(mainPath);
      const row = await prisma.mediaItem.update({
        where: { id },
        data: {
          width: info.width,
          height: info.height,
          sizeBytes: stats.size,
          mimeType: 'image/webp',
          derivatives: generated.derivatives,
          editedAt: null,
          originalPath: null,
        },
      });
      await unlinkQuiet(backupPath, logger);
      return toMediaDto(row);
    } catch (error) {
      await unlinkQuiet(tempPath, logger);
      if (error instanceof ContentError) {
        throw error;
      }
      logger?.warn('media restore failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ContentError('VALIDATION_ERROR', 'Failed to restore the original image', 400);
    }
  }

  async function remove(principal: Principal, id: string): Promise<void> {
    const existing = await prisma.mediaItem.findUnique({
      where: { id },
      select: {
        id: true,
        uploadedById: true,
        storagePath: true,
        derivatives: true,
        originalPath: true,
      },
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
    const relativePaths = [
      existing.storagePath,
      ...(existing.originalPath ? [existing.originalPath] : []),
      ...Object.values(stored),
    ];
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
      // Derivatives can be AVIF even though the canonical file is WebP; the
      // extension of the served file decides, so Content-Type is always right.
      mimeType:
        SERVED_EXTENSION_MIME_TYPES[path.extname(relativePath).toLowerCase()] ??
        SERVED_MIME_TYPES[row.mimeType] ??
        'application/octet-stream',
      sizeBytes: stats.size,
    };
  }

  return {
    upload,
    list,
    get,
    update,
    editImage,
    restoreOriginal,
    remove,
    resolvePublicFile,
    regenerateDerivatives,
    listFolders,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
  };
}
