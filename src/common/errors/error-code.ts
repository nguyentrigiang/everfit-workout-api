/**
 * Stable, machine-readable error codes returned in the `code` field of every error response.
 * Clients branch on these instead of parsing messages. Documented in the README.
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Code for errors that did not set one explicitly. Unlisted 4xx statuses fall back to
 * BAD_REQUEST (the HTTP status still carries the detail) so the code table stays fixed.
 */
export function defaultCodeForStatus(status: number): ErrorCode {
  if (status >= 500) return ErrorCode.INTERNAL_ERROR;
  switch (status) {
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 413:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    default:
      return ErrorCode.BAD_REQUEST;
  }
}
