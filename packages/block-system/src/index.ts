/**
 * Contracts entrypoint. Keep this barrel free of React, Node built-ins and the
 * parser so isomorphic consumers can import types/limits without pulling in
 * editor or server implementation.
 */
export {
  CONTENT_FORMAT,
  CONTENT_FORMAT_VERSION,
  MAX_BLOCK_COUNT,
  MAX_BLOCK_DEPTH,
  MAX_CONTENT_LENGTH,
  emptyContentStats,
  type ContentIssueCode,
  type ContentStats,
  type ContentValidation,
  type ParsedBlock,
} from './contracts.js';
