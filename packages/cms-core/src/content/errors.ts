export type ContentErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SLUG_TAKEN'
  | 'SLUG_RESERVED'
  | 'SLUG_INVALID'
  | 'VERSION_CONFLICT'
  | 'CONTENT_TOO_LARGE'
  | 'TOO_MANY_BLOCKS'
  | 'BLOCK_NESTING_TOO_DEEP'
  | 'INVALID_BLOCK_MARKUP'
  | 'INVALID_TRANSITION'
  | 'TERM_NOT_FOUND'
  | 'TERM_TAXONOMY_MISMATCH'
  | 'TERM_PARENT_INVALID'
  | 'TERM_PARENT_CYCLE'
  | 'TERM_SLUG_TAKEN'
  | 'HOOK_REJECTED'
  | 'UNKNOWN_OPTION_KEY'
  | 'INVALID_OPTION_GROUP'
  | 'SCHEDULE_TOO_SOON'
  | 'SCHEDULE_TOO_FAR'
  | 'SCHEDULE_INVALID_STATUS'
  | 'UPDATE_CHECK_FAILED'
  | 'STRUCTURE_LOCKED'
  | 'PLUGIN_ACTIVATION_FAILED'
  | 'BACKUP_FAILED'
  | 'FOLDER_EXISTS'
  | 'LANGUAGE_NOT_ENABLED'
  | 'TRANSLATION_EXISTS'
  | 'FOLDER_PARENT_INVALID'
  | 'FOLDER_CYCLE';

/**
 * Typed domain error for content/taxonomy. Routes map `statusCode` + `code` to
 * the shared error envelope; services never build HTTP responses.
 */
export class ContentError extends Error {
  readonly code: ContentErrorCode;
  readonly statusCode: number;
  /** Optional machine-readable context (never secrets or internal identifiers). */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ContentErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ContentError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
