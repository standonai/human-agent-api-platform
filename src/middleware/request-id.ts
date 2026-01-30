/**
 * Request ID middleware
 * Generates unique request IDs for tracing and error correlation
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `req_${timestamp}_${random}`;
}

/**
 * Middleware that adds a unique request ID to each request
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header if present, otherwise generate new one
  req.requestId = (req.headers['x-request-id'] as string) || generateRequestId();

  // Add request ID to response headers for client tracking
  res.setHeader('X-Request-ID', req.requestId);

  next();
}
