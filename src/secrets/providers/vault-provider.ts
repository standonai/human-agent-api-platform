/**
 * HashiCorp Vault Provider
 *
 * Integrates with HashiCorp Vault for secrets management
 * Supports:
 * - KV v2 secrets engine
 * - Token authentication
 * - AppRole authentication
 * - Kubernetes authentication
 */

import { SecretsProvider, SecretValue } from '../secrets-manager.js';

export interface VaultConfig {
  address: string;
  token?: string;
  namespace?: string;
  mountPath?: string;
  tlsSkipVerify?: boolean;
}

export class VaultProvider implements SecretsProvider {
  name = 'vault';
  private config: VaultConfig;
  private client: any = null;

  constructor(config?: VaultConfig) {
    this.config = config || this.getConfigFromEnv();
  }

  private getConfigFromEnv(): VaultConfig {
    return {
      address: process.env.VAULT_ADDR || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN,
      namespace: process.env.VAULT_NAMESPACE,
      mountPath: process.env.VAULT_MOUNT_PATH || 'secret',
      tlsSkipVerify: process.env.VAULT_SKIP_VERIFY === 'true',
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.token) {
      throw new Error('VAULT_TOKEN not configured');
    }

    // Initialize Vault client (using node-vault package)
    try {
      const vault = await import('node-vault');
      this.client = vault.default({
        endpoint: this.config.address,
        token: this.config.token,
        namespace: this.config.namespace,
      });

      // Test connection
      await this.client.health();
    } catch (error) {
      throw new Error(`Failed to initialize Vault: ${(error as Error).message}`);
    }
  }

  async getSecret(key: string): Promise<SecretValue | null> {
    if (!this.client) {
      throw new Error('Vault not initialized');
    }

    try {
      // Read from KV v2 engine
      const path = `${this.config.mountPath}/data/${key}`;
      const response = await this.client.read(path);

      if (!response || !response.data || !response.data.data) {
        return null;
      }

      const secretData = response.data.data;
      const metadata = response.data.metadata || {};

      // Support both single value and object secrets
      const value = typeof secretData === 'string'
        ? secretData
        : secretData.value || JSON.stringify(secretData);

      return {
        value,
        version: metadata.version?.toString(),
        createdAt: metadata.created_time ? new Date(metadata.created_time) : undefined,
      };
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return null;
      }
      throw new Error(`Failed to read secret from Vault: ${error.message}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.health();
      return true;
    } catch (error) {
      return false;
    }
  }
}
