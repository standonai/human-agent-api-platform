/**
 * AWS Secrets Manager Provider
 *
 * Integrates with AWS Secrets Manager for cloud-native secrets
 * Supports:
 * - Automatic secret rotation
 * - Version management
 * - IAM authentication
 * - Cross-region replication
 */

import { SecretsProvider, SecretValue } from '../secrets-manager.js';

export interface AWSConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class AWSSecretsProvider implements SecretsProvider {
  name = 'aws-secrets-manager';
  private config: AWSConfig;
  private client: any = null;

  constructor(config?: AWSConfig) {
    this.config = config || this.getConfigFromEnv();
  }

  private getConfigFromEnv(): AWSConfig {
    return {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  async initialize(): Promise<void> {
    try {
      // Lazy load AWS SDK to avoid bundling if not used
      const AWS = await import('@aws-sdk/client-secrets-manager');

      this.client = new AWS.SecretsManagerClient({
        region: this.config.region,
        credentials: this.config.accessKeyId && this.config.secretAccessKey
          ? {
              accessKeyId: this.config.accessKeyId,
              secretAccessKey: this.config.secretAccessKey,
            }
          : undefined, // Use IAM role if no credentials provided
      });

      // Test connection by listing secrets (limited to 1)
      const { ListSecretsCommand } = await import('@aws-sdk/client-secrets-manager');
      await this.client.send(new ListSecretsCommand({ MaxResults: 1 }));
    } catch (error) {
      throw new Error(`Failed to initialize AWS Secrets Manager: ${(error as Error).message}`);
    }
  }

  async getSecret(key: string): Promise<SecretValue | null> {
    if (!this.client) {
      throw new Error('AWS Secrets Manager not initialized');
    }

    try {
      const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      const command = new GetSecretValueCommand({
        SecretId: key,
      });

      const response = await this.client.send(command);

      if (!response.SecretString) {
        return null;
      }

      return {
        value: response.SecretString,
        version: response.VersionId,
        createdAt: response.CreatedDate,
      };
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return null;
      }
      throw new Error(`Failed to read secret from AWS: ${error.message}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const { ListSecretsCommand } = await import('@aws-sdk/client-secrets-manager');
      await this.client.send(new ListSecretsCommand({ MaxResults: 1 }));
      return true;
    } catch (error) {
      return false;
    }
  }
}
