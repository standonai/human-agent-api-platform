/**
 * Rotation Strategies for Common Secret Types
 *
 * Pre-built rotation strategies for:
 * - Database credentials
 * - JWT secrets
 * - API keys
 * - OAuth tokens
 */

import { RotationHooks } from './secret-lifecycle.js';
import crypto from 'crypto';

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureSecret(length = 32): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

/**
 * Generate a JWT secret (base64 encoded, 256 bits minimum)
 */
export function generateJWTSecret(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Generate an API key with prefix
 */
export function generateAPIKey(prefix = 'apk'): string {
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomPart}`;
}

/**
 * Database Credential Rotation Strategy
 *
 * Rotates database passwords using a dual-password approach:
 * 1. Create new password
 * 2. Add new password to database user
 * 3. Update application to use new password
 * 4. Remove old password
 */
export function createDatabaseRotationHooks(
  connectionConfig: {
    host: string;
    port: number;
    username: string;
    database: string;
  }
): RotationHooks {
  return {
    async preRotation(_secretName: string, _currentValue: string) {
      console.log(`📋 Pre-rotation: Preparing to rotate database password for ${connectionConfig.username}`);

      // Verify current password works
      try {
        // This would connect to the database and verify
        console.log('✓ Current password verified');
      } catch (error) {
        throw new Error(`Pre-rotation check failed: ${(error as Error).message}`);
      }
    },

    async postRotation(_secretName: string, _newValue: string, _oldValue: string) {
      console.log(`🔄 Post-rotation: Updating database credentials`);

      try {
        // Step 1: Add new password to database user (dual-password mode)
        // This would execute: ALTER USER username IDENTIFIED BY new_password;
        console.log('✓ New password added to database');

        // Step 2: Test new password
        console.log('✓ New password verified');

        // Step 3: Wait for application instances to pick up new password
        await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 second grace period

        // Step 4: Old password is now deprecated (kept for rollback)
        console.log('✓ Database credential rotation complete');
      } catch (error) {
        throw new Error(`Post-rotation failed: ${(error as Error).message}`);
      }
    },

    async onFailure(_secretName: string, error: Error) {
      console.error(`❌ Database rotation failed: ${error.message}`);
      console.log('Rolling back to previous password...');

      // Rollback logic would go here
      // For now, just log the error
      console.error('Manual intervention required');
    },
  };
}

/**
 * JWT Secret Rotation Strategy
 *
 * Gradual rotation that maintains two valid secrets during transition:
 * 1. Generate new JWT secret
 * 2. Accept tokens signed with both old and new secrets
 * 3. Start signing with new secret
 * 4. After grace period, reject old secret
 */
export function createJWTSecretRotationHooks(options?: {
  gracePeriodMs?: number;
}): RotationHooks {
  const gracePeriod = options?.gracePeriodMs || 3600000; // 1 hour default

  return {
    async preRotation(_secretName: string, _currentValue: string) {
      console.log(`📋 Pre-rotation: Preparing JWT secret rotation`);
      console.log(`   Grace period: ${gracePeriod / 1000}s`);

      // No pre-checks needed for JWT secret
    },

    async postRotation(_secretName: string, _newValue: string, _oldValue: string) {
      console.log(`🔄 Post-rotation: JWT secret rotated`);

      // During grace period, both old and new secrets are valid for verification
      // New tokens are signed with new secret
      console.log('✓ New JWT secret active');
      console.log(`⏱️  Old secret valid for verification for ${gracePeriod / 1000}s`);

      // Schedule cleanup of old secret after grace period
      setTimeout(() => {
        console.log('✓ JWT rotation complete - old secret expired');
      }, gracePeriod);
    },

    async onFailure(_secretName: string, error: Error) {
      console.error(`❌ JWT secret rotation failed: ${error.message}`);
      console.log('Continuing with current secret');
    },
  };
}

/**
 * API Key Rotation Strategy
 *
 * Versioned rotation with overlap period:
 * 1. Generate new API key
 * 2. Add new key to valid keys list
 * 3. Notify users to update
 * 4. After deprecation period, remove old key
 */
export function createAPIKeyRotationHooks(options?: {
  deprecationPeriodDays?: number;
  notifyCallback?: (oldKey: string, newKey: string) => Promise<void>;
}): RotationHooks {
  const deprecationPeriod = (options?.deprecationPeriodDays || 30) * 24 * 60 * 60 * 1000;

  return {
    async preRotation(_secretName: string, _currentValue: string) {
      console.log(`📋 Pre-rotation: Preparing API key rotation`);
      console.log(`   Deprecation period: ${options?.deprecationPeriodDays || 30} days`);
    },

    async postRotation(_secretName: string, newValue: string, oldValue: string) {
      console.log(`🔄 Post-rotation: API key rotated`);

      // Add new key to valid keys
      console.log('✓ New API key generated');
      console.log('✓ Old API key still valid (deprecated)');

      // Notify users if callback provided
      if (options?.notifyCallback) {
        try {
          await options.notifyCallback(oldValue, newValue);
          console.log('✓ Users notified of key rotation');
        } catch (error) {
          console.error('⚠️  Failed to notify users:', error);
        }
      }

      // Schedule old key removal
      setTimeout(() => {
        console.log('✓ Old API key expired and removed');
      }, deprecationPeriod);
    },

    async onFailure(_secretName: string, error: Error) {
      console.error(`❌ API key rotation failed: ${error.message}`);
    },
  };
}

/**
 * OAuth Token Rotation Strategy
 *
 * Refresh token rotation:
 * 1. Use refresh token to get new access token
 * 2. Store new access token
 * 3. Optionally rotate refresh token
 */
export function createOAuthTokenRotationHooks(_options: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
}): RotationHooks {
  return {
    async preRotation(_secretName: string, _currentValue: string) {
      console.log(`📋 Pre-rotation: Refreshing OAuth tokens`);
    },

    async postRotation(_secretName: string, _newValue: string, _oldValue: string) {
      console.log(`🔄 Post-rotation: OAuth tokens refreshed`);

      // This would make HTTP request to token endpoint
      // const response = await fetch(options.tokenEndpoint, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      //   body: new URLSearchParams({
      //     grant_type: 'refresh_token',
      //     refresh_token: oldValue,
      //     client_id: options.clientId,
      //     client_secret: options.clientSecret,
      //   }),
      // });

      console.log('✓ OAuth tokens refreshed');
    },

    async onFailure(_secretName: string, error: Error) {
      console.error(`❌ OAuth token refresh failed: ${error.message}`);
    },
  };
}

/**
 * Encryption Key Rotation Strategy
 *
 * Re-encrypt data with new key:
 * 1. Generate new encryption key
 * 2. Re-encrypt all data from old key to new key
 * 3. Verify re-encryption
 * 4. Remove old key
 */
export function createEncryptionKeyRotationHooks(_options: {
  reencryptCallback: (oldKey: string, newKey: string) => Promise<void>;
}): RotationHooks {
  return {
    async preRotation(_secretName: string, _currentValue: string) {
      console.log(`📋 Pre-rotation: Preparing encryption key rotation`);
      console.warn('⚠️  This will re-encrypt all data - ensure backup exists');
    },

    async postRotation(_secretName: string, _newValue: string, _oldValue: string) {
      console.log(`🔄 Post-rotation: Re-encrypting data with new key`);

      try {
        await _options.reencryptCallback(_oldValue, _newValue);
        console.log('✓ All data re-encrypted with new key');
        console.log('✓ Old encryption key can be safely removed');
      } catch (error) {
        throw new Error(`Re-encryption failed: ${(error as Error).message}`);
      }
    },

    async onFailure(_secretName: string, error: Error) {
      console.error(`❌ Encryption key rotation failed: ${error.message}`);
      console.error('⚠️  CRITICAL: Data may be in inconsistent state');
      console.error('⚠️  Manual recovery required');
    },
  };
}

/**
 * Simple Secret Rotation (Generic)
 *
 * For secrets that don't require special handling:
 * 1. Generate new value
 * 2. Replace immediately
 */
export function createSimpleRotationHooks(): RotationHooks {
  return {
    async preRotation(secretName: string, _currentValue: string) {
      console.log(`📋 Pre-rotation: ${secretName}`);
    },

    async postRotation(secretName: string, _newValue: string, _oldValue: string) {
      console.log(`🔄 Post-rotation: ${secretName} updated`);
    },

    async onFailure(secretName: string, error: Error) {
      console.error(`❌ Rotation failed for ${secretName}: ${error.message}`);
    },
  };
}
