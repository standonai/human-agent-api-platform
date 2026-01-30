/**
 * Rate Limiting Middleware
 *
 * Simple, agent-aware rate limiting with retry-after information.
 * Just works with zero configuration.
 */

import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error-handler.js';
import { ErrorCode } from '../types/errors.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /**
   * Requests per window for human users
   * @default 100
   */
  humanLimit?: number;

  /**
   * Requests per window for AI agents
   * @default 500
   */
  agentLimit?: number;

  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Custom limits for specific agent IDs
   * @example new Map([['premium-agent', 1000]])
   */
  customLimits?: Map<string, number>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limit store using fixed window algorithm
 */
const store = new Map<string, RateLimitEntry>();

/**
 * Rate limiting middleware with agent-aware defaults
 *
 * @example
 * // Zero config - just works
 * app.use(rateLimit());
 *
 * @example
 * // Custom limits
 * app.use(rateLimit({ agentLimit: 1000 }));
 *
 * @example
 * // Per-agent limits
 * app.use(rateLimit({
 *   customLimits: new Map([['premium-agent', 2000]])
 * }));
 */
export function rateLimit(config?: RateLimitConfig): (req: Request, res: Response, next: NextFunction) => void {
  // Sensible defaults
  const humanLimit = config?.humanLimit ?? 100;
  const agentLimit = config?.agentLimit ?? 500;
  const windowMs = config?.windowMs ?? 60000;
  const customLimits = config?.customLimits;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    // Generate key from IP and agent ID
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const agentId = req.agentContext?.identification.agentId;
    const key = agentId ? `${ip}:${agentId}` : ip;

    // Determine limit based on agent type
    const isAgent = req.agentContext?.identification.agentType !== 'human';
    let limit = humanLimit;

    if (agentId && customLimits?.has(agentId)) {
      limit = customLimits.get(agentId)!;
    } else if (isAgent) {
      limit = agentLimit;
    }

    // Get or create entry (fixed window)
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);

      // Clean expired entries (simple on-demand cleanup)
      if (store.size > 10000) {
        for (const [k, v] of store.entries()) {
          if (v.resetAt < now) store.delete(k);
        }
      }
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, limit - entry.count);
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

    // Check if limit exceeded
    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());

      throw new ApiError(
        429,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Rate limit exceeded',
        undefined,
        [
          {
            code: 'TOO_MANY_REQUESTS',
            message: `You have exceeded the rate limit of ${limit} requests per ${windowMs / 1000} seconds`,
            suggestion: `Wait ${retryAfter} seconds before retrying. Implement exponential backoff to avoid retry storms.`,
            target: 'rate_limit',
          },
        ]
      );
    }

    next();
  };
}

/**
 * Reset rate limits for testing
 * @internal
 */
export function resetRateLimits(): void {
  store.clear();
}
