import { Redis } from 'ioredis';
import { getRedisClient, isRedisHealthy } from '../config/redis-config.js';

interface AttemptBucket {
  count: number;
  windowStartedAt: number;
  lockedUntil?: number;
}

interface LoginGuardConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOCKOUT_MS = 15 * 60 * 1000;
const KEY_PREFIX = 'login_attempt';

const attemptBuckets = new Map<string, AttemptBucket>();

function getConfig(): LoginGuardConfig {
  const maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || `${DEFAULT_MAX_ATTEMPTS}`, 10);
  const windowMs = parseInt(process.env.LOGIN_ATTEMPT_WINDOW_MS || `${DEFAULT_WINDOW_MS}`, 10);
  const lockoutMs = parseInt(process.env.LOGIN_LOCKOUT_DURATION_MS || `${DEFAULT_LOCKOUT_MS}`, 10);

  return {
    maxAttempts: Number.isNaN(maxAttempts) || maxAttempts <= 0 ? DEFAULT_MAX_ATTEMPTS : maxAttempts,
    windowMs: Number.isNaN(windowMs) || windowMs <= 0 ? DEFAULT_WINDOW_MS : windowMs,
    lockoutMs: Number.isNaN(lockoutMs) || lockoutMs <= 0 ? DEFAULT_LOCKOUT_MS : lockoutMs,
  };
}

function getKeys(ip: string, email?: string): string[] {
  const normalizedEmail = email?.trim().toLowerCase();
  const keys = [`ip:${ip}`];
  if (normalizedEmail) {
    keys.push(`email:${normalizedEmail}`);
  }
  return keys;
}

function getRedis(): Redis | null {
  if (!isRedisHealthy()) {
    return null;
  }
  return getRedisClient();
}

function countKey(key: string): string {
  return `${KEY_PREFIX}:count:${key}`;
}

function lockKey(key: string): string {
  return `${KEY_PREFIX}:lock:${key}`;
}

function getOrCreateBucket(key: string, now: number): AttemptBucket {
  const existing = attemptBuckets.get(key);
  if (!existing) {
    const created: AttemptBucket = { count: 0, windowStartedAt: now };
    attemptBuckets.set(key, created);
    return created;
  }
  return existing;
}

function isAllowedInMemory(ip: string, email?: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  let maxLockedUntil = 0;

  for (const key of getKeys(ip, email)) {
    const bucket = attemptBuckets.get(key);
    if (!bucket?.lockedUntil) {
      continue;
    }
    if (bucket.lockedUntil > now) {
      maxLockedUntil = Math.max(maxLockedUntil, bucket.lockedUntil);
    } else {
      bucket.lockedUntil = undefined;
      bucket.count = 0;
      bucket.windowStartedAt = now;
    }
  }

  if (maxLockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((maxLockedUntil - now) / 1000),
    };
  }

  return { allowed: true };
}

function recordFailedInMemory(ip: string, email?: string): { locked: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const config = getConfig();
  let maxLockedUntil = 0;

  for (const key of getKeys(ip, email)) {
    const bucket = getOrCreateBucket(key, now);

    if (bucket.lockedUntil && bucket.lockedUntil > now) {
      maxLockedUntil = Math.max(maxLockedUntil, bucket.lockedUntil);
      continue;
    }

    if (bucket.windowStartedAt + config.windowMs <= now) {
      bucket.count = 0;
      bucket.windowStartedAt = now;
    }

    bucket.count += 1;
    if (bucket.count >= config.maxAttempts) {
      bucket.lockedUntil = now + config.lockoutMs;
      bucket.count = 0;
      bucket.windowStartedAt = now;
      maxLockedUntil = Math.max(maxLockedUntil, bucket.lockedUntil);
    }
  }

  if (maxLockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((maxLockedUntil - now) / 1000),
    };
  }

  return { locked: false };
}

export async function isLoginAttemptAllowed(
  ip: string,
  email?: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const redis = getRedis();
  if (!redis) {
    return isAllowedInMemory(ip, email);
  }

  try {
    let maxTtlMs = 0;
    const keys = getKeys(ip, email);
    const ttlValues = await Promise.all(keys.map((key) => redis.pttl(lockKey(key))));
    for (const ttl of ttlValues) {
      if (ttl > 0) {
        maxTtlMs = Math.max(maxTtlMs, ttl);
      }
    }

    if (maxTtlMs > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(maxTtlMs / 1000),
      };
    }
    return { allowed: true };
  } catch (error) {
    console.warn('⚠️  Login attempt Redis read failed, falling back to in-memory');
    return isAllowedInMemory(ip, email);
  }
}

export async function recordFailedLoginAttempt(
  ip: string,
  email?: string
): Promise<{ locked: boolean; retryAfterSeconds?: number }> {
  const config = getConfig();
  const redis = getRedis();
  if (!redis) {
    return recordFailedInMemory(ip, email);
  }

  try {
    let maxTtlMs = 0;
    const keys = getKeys(ip, email);

    for (const key of keys) {
      const targetCountKey = countKey(key);
      const targetLockKey = lockKey(key);

      const existingLockTtl = await redis.pttl(targetLockKey);
      if (existingLockTtl > 0) {
        maxTtlMs = Math.max(maxTtlMs, existingLockTtl);
        continue;
      }

      const count = await redis.incr(targetCountKey);
      if (count === 1) {
        await redis.pexpire(targetCountKey, config.windowMs);
      }

      if (count >= config.maxAttempts) {
        await redis.multi()
          .set(targetLockKey, '1', 'PX', config.lockoutMs)
          .del(targetCountKey)
          .exec();
        maxTtlMs = Math.max(maxTtlMs, config.lockoutMs);
      }
    }

    if (maxTtlMs > 0) {
      return {
        locked: true,
        retryAfterSeconds: Math.ceil(maxTtlMs / 1000),
      };
    }
    return { locked: false };
  } catch (error) {
    console.warn('⚠️  Login attempt Redis write failed, falling back to in-memory');
    return recordFailedInMemory(ip, email);
  }
}

export async function clearFailedLoginAttempts(ip: string, email?: string): Promise<void> {
  const redis = getRedis();
  const keys = getKeys(ip, email);

  if (redis) {
    try {
      const redisKeys = keys.flatMap((key) => [countKey(key), lockKey(key)]);
      if (redisKeys.length > 0) {
        await redis.del(...redisKeys);
      }
    } catch (error) {
      console.warn('⚠️  Login attempt Redis clear failed, continuing with in-memory cleanup');
    }
  }

  for (const key of keys) {
    attemptBuckets.delete(key);
  }
}

export async function resetLoginAttemptGuards(): Promise<void> {
  attemptBuckets.clear();

  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    const keys = await redis.keys(`${KEY_PREFIX}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Ignore cleanup errors in tests/shutdown flows.
  }
}
