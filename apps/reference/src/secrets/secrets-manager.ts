/**
 * Secrets Manager
 *
 * Unified interface for managing secrets from multiple providers:
 * - HashiCorp Vault
 * - AWS Secrets Manager
 * - Azure Key Vault
 * - Environment variables (fallback)
 *
 * Features:
 * - Automatic provider selection based on configuration
 * - Caching with TTL to reduce API calls
 * - Graceful fallback to environment variables
 * - Audit logging for secret access
 * - Support for secret rotation
 */

import { logAuditEvent, AuditEvent, LogSeverity } from '../observability/audit-logger.js';

export interface SecretValue {
  value: string;
  version?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

export interface SecretsProvider {
  name: string;
  initialize(): Promise<void>;
  getSecret(key: string): Promise<SecretValue | null>;
  isHealthy(): Promise<boolean>;
  close?(): Promise<void>;
}

interface CachedSecret {
  value: SecretValue;
  cachedAt: number;
  ttl: number;
}

export class SecretsManager {
  private provider: SecretsProvider | null = null;
  private cache: Map<string, CachedSecret> = new Map();
  private defaultTTL: number;
  private initialized = false;

  constructor(provider?: SecretsProvider, cacheTTL = 300000) {
    this.provider = provider || null;
    this.defaultTTL = cacheTTL; // 5 minutes default
  }

  /**
   * Initialize the secrets manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.provider) {
      try {
        await this.provider.initialize();
        console.log(`✅ Secrets Manager initialized: ${this.provider.name}`);
        this.initialized = true;

        // Log initialization
        logAuditEvent({
          timestamp: new Date().toISOString(),
          requestId: 'system',
          ip: 'localhost',
          method: 'SYSTEM',
          path: '/secrets/initialize',
          event: AuditEvent.USER_CREATED, // Use existing event type
          severity: LogSeverity.INFO,
          metadata: {
            provider: this.provider.name,
            action: 'secrets_manager_initialized',
          },
        });
      } catch (error) {
        console.warn(`⚠️  Secrets Manager initialization failed: ${(error as Error).message}`);
        console.warn('   Falling back to environment variables');
        this.provider = null;
      }
    } else {
      console.log('ℹ️  Secrets Manager: Using environment variables');
      this.initialized = true;
    }
  }

  /**
   * Get a secret value
   *
   * @param key - Secret key (e.g., 'JWT_SECRET', 'DATABASE_PASSWORD')
   * @param options - Retrieval options
   * @returns Secret value or null if not found
   */
  async getSecret(
    key: string,
    options: { skipCache?: boolean; ttl?: number } = {}
  ): Promise<string | null> {
    const { skipCache = false, ttl = this.defaultTTL } = options;

    // Check cache first (unless skip requested)
    if (!skipCache) {
      const cached = this.getCachedSecret(key);
      if (cached) {
        return cached.value;
      }
    }

    try {
      let secretValue: SecretValue | null = null;

      // Try provider first
      if (this.provider) {
        try {
          secretValue = await this.provider.getSecret(key);
        } catch (error) {
          console.warn(`⚠️  Error fetching secret from ${this.provider.name}:`, (error as Error).message);
          console.warn('   Falling back to environment variables');
        }
      }

      // Fallback to environment variable
      if (!secretValue) {
        const envValue = process.env[key];
        if (envValue) {
          secretValue = {
            value: envValue,
            version: 'env',
            createdAt: new Date(),
          };
        }
      }

      if (!secretValue) {
        return null;
      }

      // Cache the secret
      this.cacheSecret(key, secretValue, ttl);

      // Log secret access (without exposing value)
      logAuditEvent({
        timestamp: new Date().toISOString(),
        requestId: 'system',
        ip: 'localhost',
        method: 'GET',
        path: '/secrets/access',
        event: AuditEvent.DATA_ACCESSED,
        severity: LogSeverity.INFO,
        metadata: {
          secretKey: key,
          provider: this.provider?.name || 'environment',
          cached: false,
        },
      });

      return secretValue.value;
    } catch (error) {
      console.error(`Error retrieving secret ${key}:`, error);
      return null;
    }
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(keys: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    await Promise.all(
      keys.map(async (key) => {
        const value = await this.getSecret(key);
        results.set(key, value);
      })
    );

    return results;
  }

  /**
   * Refresh a secret (bypass cache)
   */
  async refreshSecret(key: string): Promise<string | null> {
    this.cache.delete(key);
    return this.getSecret(key, { skipCache: true });
  }

  /**
   * Clear all cached secrets
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if secrets manager is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.provider) {
      return true; // Environment variables always available
    }

    try {
      return await this.provider.isHealthy();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.provider?.name || 'environment';
  }

  /**
   * Close provider connection
   */
  async close(): Promise<void> {
    if (this.provider?.close) {
      await this.provider.close();
    }
    this.clearCache();
  }

  /**
   * Get cached secret if still valid
   */
  private getCachedSecret(key: string): SecretValue | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.cachedAt > cached.ttl) {
      // Cache expired
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  /**
   * Cache a secret value
   */
  private cacheSecret(key: string, value: SecretValue, ttl: number): void {
    this.cache.set(key, {
      value,
      cachedAt: Date.now(),
      ttl,
    });
  }
}

/**
 * Global secrets manager instance
 */
let secretsManagerInstance: SecretsManager | null = null;

/**
 * Get or create secrets manager instance
 */
export function getSecretsManager(): SecretsManager {
  if (!secretsManagerInstance) {
    secretsManagerInstance = new SecretsManager();
  }
  return secretsManagerInstance;
}

/**
 * Initialize secrets manager with provider
 */
export async function initializeSecretsManager(provider?: SecretsProvider): Promise<void> {
  if (provider) {
    secretsManagerInstance = new SecretsManager(provider);
  } else {
    secretsManagerInstance = new SecretsManager();
  }

  await secretsManagerInstance.initialize();
}

/**
 * Reset secrets manager (for testing)
 */
export function resetSecretsManager(): void {
  if (secretsManagerInstance) {
    secretsManagerInstance.clearCache();
  }
  secretsManagerInstance = null;
}
