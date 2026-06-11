/**
 * Redis-based Distributed Rate Limiter
 *
 * Implements sliding window algorithm for accurate rate limiting
 * across multiple server instances using Redis.
 */

import { Redis } from 'ioredis';
import { getRedisClient, isRedisHealthy } from '../config/redis-config.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding window rate limiter using Redis
 *
 * Algorithm:
 * - Uses Redis sorted set with timestamps as scores
 * - Removes expired entries
 * - Counts entries in current window
 * - Adds new entry if under limit
 *
 * Benefits over fixed window:
 * - No burst at window boundaries
 * - More accurate counting
 * - Better for distributed systems
 */
export class RedisRateLimiter {
  private redis: Redis | null;
  private keyPrefix: string;

  constructor(keyPrefix = 'ratelimit') {
    this.redis = getRedisClient();
    this.keyPrefix = keyPrefix;
  }

  /**
   * Check if request is allowed under rate limit
   *
   * @param key - Unique identifier (e.g., IP:agentId)
   * @param limit - Maximum requests allowed in window
   * @param windowMs - Time window in milliseconds
   * @returns Rate limit result with allowed status
   */
  async checkLimit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    // Fallback to in-memory if Redis unavailable
    if (!this.redis || !isRedisHealthy()) {
      throw new Error('Redis not available');
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    const redisKey = `${this.keyPrefix}:${key}`;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // 1. Remove expired entries (outside the sliding window)
      pipeline.zremrangebyscore(redisKey, 0, windowStart);

      // 2. Count entries in current window
      pipeline.zcard(redisKey);

      // 3. Add current request timestamp
      pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);

      // 4. Set expiry on the key (cleanup old keys)
      pipeline.pexpire(redisKey, windowMs);

      // Execute pipeline
      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Redis pipeline failed');
      }

      // Extract count (before adding current request)
      const countResult = results[1];
      if (countResult[0]) {
        throw countResult[0]; // Error in zcard
      }
      const currentCount = countResult[1] as number;

      // Calculate remaining and reset time
      const remaining = Math.max(0, limit - currentCount - 1);
      const resetAt = now + windowMs;

      // Check if allowed (count before adding current)
      const allowed = currentCount < limit;

      // If not allowed, remove the entry we just added
      if (!allowed) {
        await this.redis.zremrangebyscore(redisKey, now, now);
      }

      return {
        allowed,
        limit,
        remaining,
        resetAt,
      };
    } catch (error) {
      // On Redis error, throw to trigger fallback
      throw new Error(`Redis rate limit check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Reset rate limit for a specific key (for testing)
   */
  async reset(key: string): Promise<void> {
    if (!this.redis || !isRedisHealthy()) {
      return;
    }

    const redisKey = `${this.keyPrefix}:${key}`;
    await this.redis.del(redisKey);
  }

  /**
   * Reset all rate limits (for testing)
   */
  async resetAll(): Promise<void> {
    if (!this.redis || !isRedisHealthy()) {
      return;
    }

    const pattern = `${this.keyPrefix}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Get current usage statistics
   */
  async getStats(key: string): Promise<{
    count: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    if (!this.redis || !isRedisHealthy()) {
      throw new Error('Redis not available');
    }

    const redisKey = `${this.keyPrefix}:${key}`;

    try {
      const [count, oldest, newest] = await Promise.all([
        this.redis.zcard(redisKey),
        this.redis.zrange(redisKey, 0, 0, 'WITHSCORES'),
        this.redis.zrange(redisKey, -1, -1, 'WITHSCORES'),
      ]);

      return {
        count,
        oldestTimestamp: oldest.length > 0 ? parseFloat(oldest[1]) : null,
        newestTimestamp: newest.length > 0 ? parseFloat(newest[1]) : null,
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${(error as Error).message}`);
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.redis !== null && isRedisHealthy();
  }
}

/**
 * Singleton instance for rate limiter
 */
let rateLimiterInstance: RedisRateLimiter | null = null;

/**
 * Get Redis rate limiter instance
 */
export function getRedisRateLimiter(): RedisRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RedisRateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Reset rate limiter instance (for testing)
 */
export function resetRedisRateLimiter(): void {
  rateLimiterInstance = null;
}
