/**
 * Error Handler middleware
 * Converts errors to standardized error responses
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../types/errors.js';
import { ErrorBuilder } from '../utils/error-builder.js';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
    public target?: string,
    public details?: Array<{
      code: string;
      message: string;
      suggestion: string;
      target?: string;
    }>
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration for error handler
 */
export interface ErrorHandlerConfig {
  docBaseUrl?: string;
  includeStackTrace?: boolean;
}

/**
 * Error handler middleware
 *
 * Security features:
 * - Never leaks stack traces in production
 * - Never exposes internal file paths
 * - Logs full error details internally
 * - Sends sanitized errors to clients
 */
export function errorHandler(config: ErrorHandlerConfig = {}) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (err: Error | ApiError, req: Request, res: Response, next: NextFunction): void => {
    // If headers already sent, delegate to default error handler
    if (res.headersSent) {
      return next(err);
    }

    const requestId = req.requestId || 'unknown';

    // 🔒 Security: Log full error details internally (never sent to client)
    console.error('🚨 Error occurred:', {
      requestId,
      error: err.message,
      stack: err.stack,
      name: err.name,
      userId: (req as any).user?.id,
      agentId: (req as any).agent?.id,
      ip: req.ip,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString(),
    });

    // Handle ApiError instances
    if (err instanceof ApiError) {
      const builder = new ErrorBuilder(err.code, err.message, requestId);

      if (err.target) {
        builder.withTarget(err.target);
      }

      if (err.details) {
        err.details.forEach(detail => {
          builder.withDetail(detail.code, detail.message, detail.suggestion, detail.target);
        });
      }

      if (config.docBaseUrl) {
        builder.withDocUrl(config.docBaseUrl);
      }

      const errorResponse = builder.build();

      res.status(err.statusCode).json(errorResponse);
      return;
    }

    // Handle validation errors (e.g., from Zod or other validators)
    if (err.name === 'ValidationError' || err.name === 'ZodError') {
      const errorResponse = new ErrorBuilder(
        ErrorCode.INVALID_PARAMETER,
        'Request validation failed',
        requestId
      )
        .withDetail(
          'VALIDATION_FAILED',
          isDevelopment ? err.message : 'One or more fields failed validation',
          'Check the request parameters and try again'
        )
        .build();

      res.status(400).json(errorResponse);
      return;
    }

    // Handle rate limiting errors
    if (err.name === 'TooManyRequestsError') {
      const retryAfter = 60; // Default to 60 seconds
      res.setHeader('Retry-After', retryAfter.toString());

      const errorResponse = new ErrorBuilder(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Rate limit exceeded',
        requestId
      )
        .withDetail(
          'RATE_LIMIT',
          `Too many requests. Please retry after ${retryAfter} seconds.`,
          `Wait ${retryAfter} seconds before making another request`
        )
        .build();

      res.status(429).json(errorResponse);
      return;
    }

    // 🔒 Security: Handle unexpected errors
    // Production: Generic message, no details
    // Development: Full error message (but never stack trace in response)
    const errorResponse = new ErrorBuilder(
      ErrorCode.INTERNAL_SERVER_ERROR,
      isDevelopment
        ? err.message
        : 'An unexpected error occurred',
      requestId
    )
      .withDetail(
        'INTERNAL_ERROR',
        isDevelopment
          ? 'Check server logs for details'
          : 'The server encountered an unexpected condition',
        'Please try again later or contact support if the problem persists'
      )
      .build();

    // 🔒 Security: NEVER include stack traces in API responses
    // Stack traces can leak:
    // - Internal file paths
    // - Code structure
    // - Library versions
    // - Security vulnerabilities
    //
    // Instead, use request_id to correlate with server logs
    // Example: "Contact support with request ID: req_abc123"

    res.status(500).json(errorResponse);
  };
}

/**
 * Async handler wrapper to catch promise rejections
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
