/**
 * Redis Configuration for Distributed Rate Limiting
 *
 * Provides Redis client management with automatic reconnection,
 * health checks, and graceful degradation.
 */

import Redis, { RedisOptions } from 'ioredis';

let redisClient: Redis | null = null;
let redisHealthy = false;

/**
 * Get Redis configuration from environment variables
 */
export function getRedisConfig(): RedisOptions {
  const config: RedisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),

    // Connection settings
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,

    // Automatic reconnection
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      console.log(`🔄 Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },

    // Don't fail if Redis is unavailable
    lazyConnect: true,
  };

  // TLS support for production
  if (process.env.REDIS_TLS === 'true') {
    config.tls = {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    };
  }

  return config;
}

/**
 * Initialize Redis client for rate limiting
 */
export async function initializeRedis(): Promise<Redis | null> {
  // Check if Redis is disabled
  if (process.env.DISABLE_REDIS === 'true') {
    console.log('ℹ️  Redis disabled via DISABLE_REDIS=true');
    redisClient = null;
    redisHealthy = false;
    return null;
  }

  // Return existing client if already initialized
  if (redisClient) {
    return redisClient;
  }

  try {
    const config = getRedisConfig();

    // Disable auto-reconnect for graceful fallback
    config.retryStrategy = (times: number) => {
      if (times > 3) {
        console.warn('⚠️  Redis connection failed after 3 attempts, using in-memory fallback');
        return null; // Stop retrying
      }
      return Math.min(times * 50, 200);
    };

    const client = new Redis(config);

    // Event handlers
    client.on('connect', () => {
      console.log('🔗 Redis connecting...');
    });

    client.on('ready', () => {
      console.log('✅ Redis connected and ready');
      redisHealthy = true;
    });

    client.on('error', (err: Error) => {
      // Suppress verbose error logging during initialization
      if (!err.message.includes('ECONNREFUSED') || redisHealthy) {
        console.warn('⚠️  Redis error:', err.message);
      }
      redisHealthy = false;
    });

    client.on('close', () => {
      if (redisHealthy) {
        console.warn('⚠️  Redis connection closed');
      }
      redisHealthy = false;
    });

    // Try to connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 2000)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // Test connection
    await client.ping();

    redisClient = client;
    redisHealthy = true;

    return client;
  } catch (error) {
    const err = error as Error;
    console.warn('⚠️  Redis initialization failed:', err.message);
    console.warn('   Falling back to in-memory rate limiting');

    // Disconnect any partial connection
    if (redisClient) {
      try {
        await redisClient.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    redisClient = null;
    redisHealthy = false;
    return null;
  }
}

/**
 * Get Redis client (may be null if unavailable)
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Check if Redis is available and healthy
 */
export function isRedisHealthy(): boolean {
  return redisHealthy && redisClient !== null;
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ Redis connection closed gracefully');
    } catch (error) {
      console.warn('⚠️  Error closing Redis:', (error as Error).message);
    }
    redisClient = null;
    redisHealthy = false;
  }
}

/**
 * Log Redis status at startup
 */
export function logRedisStatus(): void {
  if (process.env.DISABLE_REDIS === 'true') {
    console.log('🔒 Distributed Rate Limiting: Disabled (using in-memory)');
    return;
  }

  const config = getRedisConfig();

  console.log('🔒 Distributed Rate Limiting Configuration:');
  if (isRedisHealthy()) {
    console.log(`   ✅ Redis: Connected`);
    console.log(`   📍 Host: ${config.host}:${config.port}`);
    console.log(`   🗄️  Database: ${config.db}`);
    console.log(`   🔐 TLS: ${config.tls ? 'Enabled' : 'Disabled'}`);
    console.log(`   ✅ Mode: Distributed (multi-instance)`);
  } else {
    console.log(`   ⚠️  Redis: Unavailable`);
    console.log(`   📍 Attempted: ${config.host}:${config.port}`);
    console.log(`   ⚠️  Mode: In-memory (single instance only)`);
    console.log(`   💡 Tip: Start Redis server for distributed rate limiting`);
  }
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  if (!redisClient) {
    return {
      healthy: false,
      error: 'Redis client not initialized',
    };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;

    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      error: (error as Error).message,
    };
  }
}
