/**
 * Azure Key Vault Provider
 *
 * Integrates with Azure Key Vault for secrets management
 * Supports:
 * - Managed identities
 * - Service principal authentication
 * - Secret versioning
 * - RBAC access control
 */

import { SecretsProvider, SecretValue } from '../secrets-manager.js';

export interface AzureConfig {
  vaultUrl: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export class AzureKeyVaultProvider implements SecretsProvider {
  name = 'azure-key-vault';
  private config: AzureConfig;
  private client: any = null;

  constructor(config?: AzureConfig) {
    this.config = config || this.getConfigFromEnv();
  }

  private getConfigFromEnv(): AzureConfig {
    const vaultName = process.env.AZURE_KEY_VAULT_NAME;
    return {
      vaultUrl: process.env.AZURE_KEY_VAULT_URL ||
        (vaultName ? `https://${vaultName}.vault.azure.net` : ''),
      tenantId: process.env.AZURE_TENANT_ID,
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.vaultUrl) {
      throw new Error('Azure Key Vault URL not configured');
    }

    try {
      // Lazy load Azure SDK
      const { SecretClient } = await import('@azure/keyvault-secrets');
      const { DefaultAzureCredential, ClientSecretCredential } = await import('@azure/identity');

      // Use service principal if credentials provided, otherwise managed identity
      let credential;
      if (this.config.tenantId && this.config.clientId && this.config.clientSecret) {
        credential = new ClientSecretCredential(
          this.config.tenantId,
          this.config.clientId,
          this.config.clientSecret
        );
      } else {
        credential = new DefaultAzureCredential();
      }

      this.client = new SecretClient(this.config.vaultUrl, credential);

      // Test connection by listing secrets (limit 1)
      const iterator = this.client.listPropertiesOfSecrets();
      await iterator.next();
    } catch (error) {
      throw new Error(`Failed to initialize Azure Key Vault: ${(error as Error).message}`);
    }
  }

  async getSecret(key: string): Promise<SecretValue | null> {
    if (!this.client) {
      throw new Error('Azure Key Vault not initialized');
    }

    try {
      const secret = await this.client.getSecret(key);

      if (!secret || !secret.value) {
        return null;
      }

      return {
        value: secret.value,
        version: secret.properties.version,
        createdAt: secret.properties.createdOn,
        expiresAt: secret.properties.expiresOn,
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw new Error(`Failed to read secret from Azure: ${error.message}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const iterator = this.client.listPropertiesOfSecrets();
      await iterator.next();
      return true;
    } catch (error) {
      return false;
    }
  }
}
