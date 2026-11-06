import type { Paged, Principal } from '../content/types.js';

/**
 * Media library contracts (Phase 6, P6-01/P6-02/P6-03/P6-05).
 *
 * Scope is deliberately narrow: raster still images only (JPEG, PNG, WebP, GIF).
 * SVG, PDF, video, JSON and every other uploadable document type are rejected
 * (threat model T-12: no server-side rendering or script-bearing payloads).
 */

/** Uploads above this size are rejected before any decoding work happens. */
export const MEDIA_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The canonical (largest) derivative is capped inside this square. */
export const MEDIA_MAIN_MAX_DIMENSION = 2560;

/** Widths generated for every upload, in addition to the canonical image. */
export const MEDIA_DERIVATIVE_WIDTHS = [300, 600, 1200] as const;

/**
 * Every derivative exists twice: modern AVIF for browsers that support it and
 * WebP as the universal fallback. Keys are `<width>` (WebP) and
 * `<width>:avif` (AVIF), e.g. `{ "300": "…-300.webp", "300:avif": "…-300.avif" }`.
 */
export const MEDIA_AVIF_QUALITY = 52;

export type MediaDerivativeWidth = (typeof MEDIA_DERIVATIVE_WIDTHS)[number];

/** Extensions accepted by the upload endpoint (lower case, no dot). */
export const MEDIA_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;

export type MediaExtension = (typeof MEDIA_ALLOWED_EXTENSIONS)[number];

/**
 * Image formats the content sniff accepts. `sharp`'s reported format is the
 * source of truth, never the multipart content type or the file extension.
 */
export const MEDIA_ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'gif'] as const;

export type MediaDerivatives = Record<string, string>;

/** Admin-facing media DTO. Storage paths never cross the API boundary. */
export interface MediaDto {
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
  /** Canonical public URL: `/api/media/<id>/<fileName>`. */
  url: string;
  /**
   * Width-keyed public URLs for the generated variants. WebP uses the plain
   * width key (`300`); AVIF uses the same key with `:avif` (`300:avif`).
   */
  derivatives: MediaDerivatives;
  uploadedById: string | null;
  /** Virtual folder id; null means Uncategorized. */
  folderId: string | null;
  /** ISO instant of the last saved image edit, or null when pristine. */
  editedAt: string | null;
  /** True when a pre-edit backup exists and "Restore original" is available. */
  hasOriginal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MediaListQuery {
  page: number;
  perPage: number;
  search?: string | undefined;
  /** Only `image` exists in Phase 6; anything else is a validation error. */
  type?: 'image' | undefined;
  /** Creation-date ordering; newest first by default. */
  order?: 'newest' | 'oldest' | undefined;
  /** ISO month `YYYY-MM` filter on the creation date ("All dates"). */
  month?: string | undefined;
  /** Folder id, or `none` for Uncategorized; omitted = all folders. */
  folder?: string | undefined;
}

/** Virtual media folder (files stay flat on disk). */
export interface MediaFolderDto {
  id: string;
  name: string;
  /** Parent folder id; null for a top-level folder. */
  parentId: string | null;
  /** Number of media items assigned to the folder. */
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadMediaInput {
  buffer: Buffer;
  originalName: string;
  /** Client-declared multipart content type. Checked, then ignored in favour of sniffing. */
  mimeType: string;
  altText?: string | undefined;
  caption?: string | undefined;
  description?: string | undefined;
  /** Optional folder to upload into; null/undefined = Uncategorized. */
  folderId?: string | null | undefined;
}

export interface EditMediaInput {
  /** The edited image bytes; validated and re-encoded like an upload. */
  buffer: Buffer;
}

export interface UpdateMediaInput {
  altText?: string | undefined;
  caption?: string | undefined;
  description?: string | undefined;
  /** Move to a folder, or null to remove from the current folder. */
  folderId?: string | null | undefined;
}

/** Cursor-based bulk derivative regeneration (Media Library action). */
export interface RegenerateMediaInput {
  /** Last id from the previous batch; omit to start from the beginning. */
  after?: string | undefined;
  /** 1-50; defaults to 20. */
  limit?: number | undefined;
}

export interface RegenerateMediaResult {
  processed: number;
  failed: number;
  remaining: number;
  /** Cursor for the next batch, or null when the library is exhausted. */
  nextAfter: string | null;
}

/** A resolved, confinement-checked file ready to be streamed by the route. */
export interface MediaFile {
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MediaService {
  upload(principal: Principal, input: UploadMediaInput): Promise<MediaDto>;
  list(principal: Principal, query: MediaListQuery): Promise<Paged<MediaDto>>;
  get(principal: Principal, id: string): Promise<MediaDto>;
  update(principal: Principal, id: string, input: UpdateMediaInput): Promise<MediaDto>;
  /** Replace the canonical file with an edited image, keeping a backup. */
  editImage(principal: Principal, id: string, input: EditMediaInput): Promise<MediaDto>;
  /** Restore the pre-edit backup and regenerate derivatives. */
  restoreOriginal(principal: Principal, id: string): Promise<MediaDto>;
  /** Deletes the row (authoritative) and its files best-effort. */
  remove(principal: Principal, id: string): Promise<void>;
  listFolders(principal: Principal): Promise<MediaFolderDto[]>;
  createFolder(
    principal: Principal,
    name: string,
    parentId?: string | null,
  ): Promise<MediaFolderDto>;
  renameFolder(principal: Principal, id: string, name: string): Promise<MediaFolderDto>;
  /** Moves a folder under another folder (or to the top level); cycle-safe. */
  moveFolder(principal: Principal, id: string, parentId: string | null): Promise<MediaFolderDto>;
  /** Deletes the folder; child folders move to its parent and items become Uncategorized. */
  deleteFolder(principal: Principal, id: string): Promise<void>;
  /** Rebuild derivatives for every image, in bounded batches. */
  regenerateDerivatives(
    principal: Principal,
    input?: RegenerateMediaInput,
  ): Promise<RegenerateMediaResult>;
  /** Public, unauthenticated file resolution with path confinement. */
  resolvePublicFile(id: string, name: string): Promise<MediaFile>;
}
