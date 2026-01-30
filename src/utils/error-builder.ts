/**
 * Utility for building standardized error responses
 */

import { ErrorResponse, ApiError, ErrorDetail, ErrorCode } from '../types/errors.js';

export class ErrorBuilder {
  private error: ApiError;

  constructor(code: ErrorCode, message: string, requestId: string) {
    this.error = {
      code,
      message,
      request_id: requestId,
    };
  }

  withTarget(target: string): this {
    this.error.target = target;
    return this;
  }

  withDetail(code: string, message: string, suggestion: string, target?: string): this {
    if (!this.error.details) {
      this.error.details = [];
    }

    const detail: ErrorDetail = {
      code,
      message,
      suggestion,
    };

    if (target) {
      detail.target = target;
    }

    this.error.details.push(detail);
    return this;
  }

  withDocUrl(baseUrl: string): this {
    this.error.doc_url = `${baseUrl}/errors/${this.error.code}`;
    return this;
  }

  withFullDocUrl(fullUrl: string): this {
    this.error.doc_url = fullUrl;
    return this;
  }

  build(): ErrorResponse {
    return {
      error: this.error,
    };
  }
}

/**
 * Helper function to create a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  options?: {
    target?: string;
    details?: ErrorDetail[];
    docUrl?: string;
  }
): ErrorResponse {
  const builder = new ErrorBuilder(code, message, requestId);

  if (options?.target) {
    builder.withTarget(options.target);
  }

  if (options?.details) {
    options.details.forEach(detail => {
      builder.withDetail(detail.code, detail.message, detail.suggestion, detail.target);
    });
  }

  if (options?.docUrl) {
    builder.withFullDocUrl(options.docUrl);
  }

  return builder.build();
}
