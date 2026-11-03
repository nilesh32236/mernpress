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

export type MediaDerivativeWidth = (typeof MEDIA_DERIVATIVE_WIDTHS)[number];

/** Extensions accepted by the upload endpoint (lower case, no dot). */
export const MEDIA_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;

export type MediaExtension = (typeof MEDIA_ALLOWED_EXTENSIONS)[number];

/**
 * Image formats the content sniff accepts. `sharp`'s reported format is the
 * source of truth, never the multipart content type or the file extension.
 */
export const MEDIA_ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'gif'] as const;

export type MediaDerivatives = Record<`${MediaDerivativeWidth}`, string>;

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
  /** Width-keyed public URLs for the generated variants. */
  derivatives: MediaDerivatives;
  uploadedById: string | null;
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
}

export interface UploadMediaInput {
  buffer: Buffer;
  originalName: string;
  /** Client-declared multipart content type. Checked, then ignored in favour of sniffing. */
  mimeType: string;
  altText?: string | undefined;
  caption?: string | undefined;
  description?: string | undefined;
}

export interface UpdateMediaInput {
  altText?: string | undefined;
  caption?: string | undefined;
  description?: string | undefined;
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
  /** Deletes the row (authoritative) and its files best-effort. */
  remove(principal: Principal, id: string): Promise<void>;
  /** Public, unauthenticated file resolution with path confinement. */
  resolvePublicFile(id: string, name: string): Promise<MediaFile>;
}
