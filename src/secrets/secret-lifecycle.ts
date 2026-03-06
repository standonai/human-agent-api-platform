/**
 * Secret Lifecycle Management
 *
 * Manages the complete lifecycle of secrets:
 * - Creation and versioning
 * - Rotation (automatic and manual)
 * - Expiration and TTL
 * - Scoping and access control
 * - Audit and compliance
 */

import crypto from 'crypto';
import { getSecretsManager } from './secrets-manager.js';
import { logAuditEvent, AuditEvent, LogSeverity } from '../observability/audit-logger.js';

export interface SecretMetadata {
  name: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  rotationSchedule?: RotationSchedule;
  scope: SecretScope;
  tags?: Record<string, string>;
}

export interface RotationSchedule {
  enabled: boolean;
  intervalDays: number;
  nextRotation?: Date;
  lastRotation?: Date;
  strategy: RotationStrategy;
}

export enum RotationStrategy {
  IMMEDIATE = 'immediate',        // New secret replaces old immediately
  GRADUAL = 'gradual',           // Both secrets valid during transition
  VERSIONED = 'versioned',       // Multiple versions maintained
}

export interface SecretScope {
  environments: string[];         // dev, staging, production
  services: string[];            // api-server, worker, etc.
  roles: string[];               // admin, service, readonly
}

export interface RotationHooks {
  preRotation?: (_secretName: string, _currentValue: string) => Promise<void>;
  postRotation?: (_secretName: string, _newValue: string, _oldValue: string) => Promise<void>;
  onFailure?: (_secretName: string, error: Error) => Promise<void>;
}

export interface RotationResult {
  success: boolean;
  secretName: string;
  oldVersion: number;
  newVersion: number;
  rotatedAt: Date;
  error?: string;
}

/**
 * Secret Lifecycle Manager
 */
export class SecretLifecycleManager {
  private metadata: Map<string, SecretMetadata> = new Map();
  private rotationHooks: Map<string, RotationHooks> = new Map();
  private rotationTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Register a secret with lifecycle management
   */
  registerSecret(
    name: string,
    options: {
      rotationSchedule?: Partial<RotationSchedule>;
      scope?: Partial<SecretScope>;
      expiresAt?: Date;
      tags?: Record<string, string>;
    } = {}
  ): void {
    const metadata: SecretMetadata = {
      name,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: options.expiresAt,
      rotationSchedule: options.rotationSchedule
        ? {
            enabled: true,
            intervalDays: options.rotationSchedule.intervalDays || 90,
            strategy: options.rotationSchedule.strategy || RotationStrategy.IMMEDIATE,
            ...options.rotationSchedule,
          }
        : undefined,
      scope: {
        environments: options.scope?.environments || ['*'],
        services: options.scope?.services || ['*'],
        roles: options.scope?.roles || ['*'],
      },
      tags: options.tags,
    };

    this.metadata.set(name, metadata);

    // Schedule automatic rotation if enabled
    if (metadata.rotationSchedule?.enabled) {
      this.scheduleRotation(name);
    }

    // Log registration
    logAuditEvent({
      timestamp: new Date().toISOString(),
      requestId: 'system',
      ip: 'localhost',
      method: 'POST',
      path: '/secrets/register',
      event: AuditEvent.USER_CREATED,
      severity: LogSeverity.INFO,
      metadata: {
        secretName: name,
        action: 'secret_registered',
        rotationEnabled: metadata.rotationSchedule?.enabled,
        expiresAt: metadata.expiresAt?.toISOString(),
      },
    });
  }

  /**
   * Register rotation hooks for a secret
   */
  registerRotationHooks(secretName: string, hooks: RotationHooks): void {
    this.rotationHooks.set(secretName, hooks);
  }

  /**
   * Manually rotate a secret
   */
  async rotateSecret(
    secretName: string,
    newValue?: string,
    options: { force?: boolean } = {}
  ): Promise<RotationResult> {
    const metadata = this.metadata.get(secretName);

    if (!metadata) {
      throw new Error(`Secret ${secretName} is not registered for lifecycle management`);
    }

    const secretsManager = getSecretsManager();
    const hooks = this.rotationHooks.get(secretName);

    try {
      // Get current secret value
      const currentValue = await secretsManager.getSecret(secretName);

      if (!currentValue && !options.force) {
        throw new Error(`Current secret value not found for ${secretName}`);
      }

      // Pre-rotation hook
      if (hooks?.preRotation) {
        await hooks.preRotation(secretName, currentValue || '');
      }

      // Generate or use provided new value
      const rotatedValue = newValue || this.generateSecretValue(secretName);

      // Store new secret (implementation depends on provider)
      // For now, we'll just refresh the cache
      await secretsManager.refreshSecret(secretName);

      // Post-rotation hook
      if (hooks?.postRotation) {
        await hooks.postRotation(secretName, rotatedValue, currentValue || '');
      }

      // Update metadata
      const oldVersion = metadata.version;
      metadata.version += 1;
      metadata.updatedAt = new Date();
      if (metadata.rotationSchedule) {
        metadata.rotationSchedule.lastRotation = new Date();
        metadata.rotationSchedule.nextRotation = this.calculateNextRotation(
          metadata.rotationSchedule.intervalDays
        );
      }

      // Reschedule next rotation
      if (metadata.rotationSchedule?.enabled) {
        this.scheduleRotation(secretName);
      }

      // Log rotation
      logAuditEvent({
        timestamp: new Date().toISOString(),
        requestId: 'system',
        ip: 'localhost',
        method: 'PUT',
        path: '/secrets/rotate',
        event: AuditEvent.USER_UPDATED,
        severity: LogSeverity.WARNING,
        metadata: {
          secretName,
          action: 'secret_rotated',
          oldVersion,
          newVersion: metadata.version,
          forced: options.force,
        },
      });

      return {
        success: true,
        secretName,
        oldVersion,
        newVersion: metadata.version,
        rotatedAt: new Date(),
      };
    } catch (error) {
      // Failure hook
      if (hooks?.onFailure) {
        await hooks.onFailure(secretName, error as Error);
      }

      // Log failure
      logAuditEvent({
        timestamp: new Date().toISOString(),
        requestId: 'system',
        ip: 'localhost',
        method: 'PUT',
        path: '/secrets/rotate',
        event: AuditEvent.USER_UPDATED,
        severity: LogSeverity.ERROR,
        metadata: {
          secretName,
          action: 'secret_rotation_failed',
          error: (error as Error).message,
        },
      });

      return {
        success: false,
        secretName,
        oldVersion: metadata.version,
        newVersion: metadata.version,
        rotatedAt: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check if a secret is expired
   */
  isExpired(secretName: string): boolean {
    const metadata = this.metadata.get(secretName);
    if (!metadata || !metadata.expiresAt) {
      return false;
    }

    return new Date() > metadata.expiresAt;
  }

  /**
   * Check if a secret needs rotation
   */
  needsRotation(secretName: string): boolean {
    const metadata = this.metadata.get(secretName);
    if (!metadata || !metadata.rotationSchedule?.enabled) {
      return false;
    }

    if (!metadata.rotationSchedule.nextRotation) {
      return true; // Never rotated
    }

    return new Date() >= metadata.rotationSchedule.nextRotation;
  }

  /**
   * Check if a context has access to a secret
   */
  hasAccess(
    secretName: string,
    context: {
      environment?: string;
      service?: string;
      role?: string;
    }
  ): boolean {
    const metadata = this.metadata.get(secretName);
    if (!metadata) {
      return false;
    }

    const scope = metadata.scope;

    // Check environment
    if (
      context.environment &&
      !scope.environments.includes('*') &&
      !scope.environments.includes(context.environment)
    ) {
      return false;
    }

    // Check service
    if (
      context.service &&
      !scope.services.includes('*') &&
      !scope.services.includes(context.service)
    ) {
      return false;
    }

    // Check role
    if (
      context.role &&
      !scope.roles.includes('*') &&
      !scope.roles.includes(context.role)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Get secret metadata
   */
  getMetadata(secretName: string): SecretMetadata | undefined {
    return this.metadata.get(secretName);
  }

  /**
   * List all registered secrets
   */
  listSecrets(filters?: {
    environment?: string;
    service?: string;
    needsRotation?: boolean;
    expired?: boolean;
  }): SecretMetadata[] {
    let secrets = Array.from(this.metadata.values());

    if (filters) {
      if (filters.environment) {
        secrets = secrets.filter((s) =>
          s.scope.environments.includes('*') ||
          s.scope.environments.includes(filters.environment!)
        );
      }

      if (filters.service) {
        secrets = secrets.filter((s) =>
          s.scope.services.includes('*') ||
          s.scope.services.includes(filters.service!)
        );
      }

      if (filters.needsRotation) {
        secrets = secrets.filter((s) => this.needsRotation(s.name));
      }

      if (filters.expired) {
        secrets = secrets.filter((s) => this.isExpired(s.name));
      }
    }

    return secrets;
  }

  /**
   * Schedule automatic rotation for a secret
   */
  private scheduleRotation(secretName: string): void {
    // Clear existing timer
    const existingTimer = this.rotationTimers.get(secretName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const metadata = this.metadata.get(secretName);
    if (!metadata?.rotationSchedule?.enabled) {
      return;
    }

    const nextRotation =
      metadata.rotationSchedule.nextRotation ||
      this.calculateNextRotation(metadata.rotationSchedule.intervalDays);

    const delay = nextRotation.getTime() - Date.now();

    if (delay > 0) {
      const timer = setTimeout(async () => {
        console.log(`🔄 Automatic rotation triggered for secret: ${secretName}`);
        await this.rotateSecret(secretName);
      }, delay);

      this.rotationTimers.set(secretName, timer);
    }
  }

  /**
   * Calculate next rotation date
   */
  private calculateNextRotation(intervalDays: number): Date {
    const next = new Date();
    next.setDate(next.getDate() + intervalDays);
    return next;
  }

  /**
   * Generate a new secret value
   */
  private generateSecretValue(_secretName: string): string {
    // Default implementation - should be overridden per secret type
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Clean up (stop all rotation timers)
   */
  cleanup(): void {
    for (const timer of this.rotationTimers.values()) {
      clearTimeout(timer);
    }
    this.rotationTimers.clear();
  }
}

/**
 * Global lifecycle manager instance
 */
let lifecycleManagerInstance: SecretLifecycleManager | null = null;

/**
 * Get lifecycle manager instance
 */
export function getSecretLifecycleManager(): SecretLifecycleManager {
  if (!lifecycleManagerInstance) {
    lifecycleManagerInstance = new SecretLifecycleManager();
  }
  return lifecycleManagerInstance;
}

/**
 * Reset lifecycle manager (for testing)
 */
export function resetSecretLifecycleManager(): void {
  if (lifecycleManagerInstance) {
    lifecycleManagerInstance.cleanup();
  }
  lifecycleManagerInstance = null;
}
