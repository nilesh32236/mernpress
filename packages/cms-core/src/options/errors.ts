import { ContentError } from '../content/errors.js';

export type OptionErrorCode =
  | 'UNKNOWN_OPTION_KEY'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_OPTION_GROUP';

/**
 * Typed domain error for the options store. Extends `ContentError` so existing
 * route-level handlers that catch `ContentError` keep working.
 */
export class OptionError extends ContentError {
  constructor(code: OptionErrorCode, message: string, statusCode: number) {
    super(code, message, statusCode);
    this.name = 'OptionError';
  }
}
