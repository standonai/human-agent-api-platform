/**
 * Standardized error response types for the API platform.
 * All APIs must use this structure to ensure agent-parseable errors.
 */

export interface ErrorDetail {
  code: string;
  message: string;
  suggestion: string;
  target?: string;
}

export interface ApiError {
  code: string;
  message: string;
  target?: string;
  details?: ErrorDetail[];
  doc_url?: string;
  request_id: string;
}

export interface ErrorResponse {
  error: ApiError;
}

/**
 * Standard error codes used across the platform
 */
export enum ErrorCode {
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
