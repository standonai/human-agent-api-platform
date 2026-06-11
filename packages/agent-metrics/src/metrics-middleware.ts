/**
 * Metrics Collection Middleware
 *
 * Automatically captures metrics for every request.
 * Zero configuration required - just works.
 */

import { Request, Response, NextFunction } from 'express';
import { metricsStore } from './metrics-store.js';

/**
 * Middleware that collects metrics for observability
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Capture response details when the response finishes
  const originalSend = res.send;
  res.send = function (body?: any): Response {
    res.send = originalSend; // Restore original

    const responseTime = Date.now() - startTime;
    const agentType = req.agentContext?.identification.agentType || 'human';
    const agentId = req.agentContext?.identification.agentId;

    // Check if this was a rate limit error
    const isRateLimited = res.statusCode === 429;

    // Record metric
    metricsStore.record({
      timestamp: Date.now(),
      agentType: agentType as any,
      agentId,
      method: req.method,
      path: req.route?.path || req.path, // Use route path if available (e.g., /users/:id)
      statusCode: res.statusCode,
      responseTimeMs: responseTime,
      isRateLimited,
    });

    return originalSend.call(this, body);
  };

  next();
}
