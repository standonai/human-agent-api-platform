/**
 * Secrets Management Module
 *
 * Automatically selects the appropriate secrets provider based on configuration
 */

export * from './secrets-manager.js';
export * from './secret-lifecycle.js';
export * from './rotation-strategies.js';
export * from './providers/env-provider.js';
export * from './providers/vault-provider.js';
export * from './providers/aws-provider.js';
export * from './providers/azure-provider.js';

import { SecretsProvider } from './secrets-manager.js';
import { EnvironmentProvider } from './providers/env-provider.js';
import { VaultProvider } from './providers/vault-provider.js';
import { AWSSecretsProvider } from './providers/aws-provider.js';
import { AzureKeyVaultProvider } from './providers/azure-provider.js';

/**
 * Create secrets provider based on environment configuration
 *
 * Provider selection (in order of precedence):
 * 1. SECRETS_PROVIDER env var (vault, aws, azure, env)
 * 2. Auto-detect based on provider-specific env vars
 * 3. Default to environment variables
 */
export async function createSecretsProvider(): Promise<SecretsProvider> {
  const providerType = process.env.SECRETS_PROVIDER?.toLowerCase();

  // Explicit provider selection
  if (providerType === 'vault') {
    return new VaultProvider();
  }

  if (providerType === 'aws') {
    return new AWSSecretsProvider();
  }

  if (providerType === 'azure') {
    return new AzureKeyVaultProvider();
  }

  if (providerType === 'env' || providerType === 'environment') {
    return new EnvironmentProvider();
  }

  // Auto-detect provider based on env vars
  if (process.env.VAULT_ADDR && process.env.VAULT_TOKEN) {
    console.log('🔍 Auto-detected: HashiCorp Vault');
    return new VaultProvider();
  }

  if (process.env.AWS_REGION && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)) {
    console.log('🔍 Auto-detected: AWS Secrets Manager');
    return new AWSSecretsProvider();
  }

  if (process.env.AZURE_KEY_VAULT_URL || process.env.AZURE_KEY_VAULT_NAME) {
    console.log('🔍 Auto-detected: Azure Key Vault');
    return new AzureKeyVaultProvider();
  }

  // Default to environment variables
  console.log('ℹ️  Using environment variables for secrets');
  return new EnvironmentProvider();
}

/**
 * Log secrets provider status
 */
export function logSecretsStatus(providerName: string): void {
  console.log('🔒 Secrets Management Configuration:');

  if (providerName === 'environment') {
    console.log('   ⚠️  Provider: Environment Variables');
    console.log('   ⚠️  Security: Secrets stored in .env file');
    console.log('   💡 Tip: Use Vault/AWS/Azure for production');
  } else {
    console.log(`   ✅ Provider: ${providerName}`);
    console.log('   ✅ Security: External secrets manager');
    console.log('   ✅ Mode: Production-ready');
  }
}

/**
 * Health check for secrets provider
 */
export async function checkSecretsHealth(provider: SecretsProvider): Promise<{
  healthy: boolean;
  provider: string;
  error?: string;
}> {
  try {
    const healthy = await provider.isHealthy();
    return {
      healthy,
      provider: provider.name,
    };
  } catch (error) {
    return {
      healthy: false,
      provider: provider.name,
      error: (error as Error).message,
    };
  }
}
