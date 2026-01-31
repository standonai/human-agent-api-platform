/**
 * Rate Limiting Middleware
 *
 * Distributed rate limiting with Redis support and in-memory fallback.
 * - Uses Redis for multi-instance deployments (sliding window algorithm)
 * - Falls back to in-memory for single-instance (fixed window algorithm)
 * - Agent-aware with custom limits
 * - Zero configuration - just works
 */

import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error-handler.js';
import { ErrorCode } from '../types/errors.js';
import { getRedisRateLimiter } from './rate-limiter-redis.js';

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
 * Rate limiting middleware with Redis support and agent-aware defaults
 *
 * Automatically uses:
 * - Redis (sliding window) when available → Distributed across instances
 * - In-memory (fixed window) as fallback → Single instance only
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

  // Get Redis rate limiter (may not be available)
  const redisLimiter = getRedisRateLimiter();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    // Try Redis first (distributed), fallback to in-memory
    let allowed = true;
    let remaining = 0;
    let resetAt = 0;
    let usedRedis = false;

    try {
      if (redisLimiter.isAvailable()) {
        // Use Redis (sliding window - more accurate)
        const result = await redisLimiter.checkLimit(key, limit, windowMs);
        allowed = result.allowed;
        remaining = result.remaining;
        resetAt = result.resetAt;
        usedRedis = true;
      } else {
        // Fallback to in-memory (fixed window)
        const inMemoryResult = checkInMemoryLimit(key, limit, windowMs, now);
        allowed = inMemoryResult.allowed;
        remaining = inMemoryResult.remaining;
        resetAt = inMemoryResult.resetAt;
      }
    } catch (error) {
      // Redis failed, use in-memory fallback
      if (usedRedis) {
        console.warn('⚠️  Redis rate limit check failed, using in-memory fallback');
      }
      const inMemoryResult = checkInMemoryLimit(key, limit, windowMs, now);
      allowed = inMemoryResult.allowed;
      remaining = inMemoryResult.remaining;
      resetAt = inMemoryResult.resetAt;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(resetAt).toISOString());

    // Check if limit exceeded
    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - now) / 1000);
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
 * In-memory rate limit check (fallback when Redis unavailable)
 * Uses fixed window algorithm
 */
function checkInMemoryLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number
): { allowed: boolean; remaining: number; resetAt: number } {
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

  // Calculate remaining and check if allowed
  const remaining = Math.max(0, limit - entry.count);
  const allowed = entry.count <= limit;

  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limits for testing
 * @internal
 */
export function resetRateLimits(): void {
  store.clear();
}
