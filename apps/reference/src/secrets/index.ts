/**
 * Secrets Management Module
 *
 * Ships with the environment-variable provider only. External managers
 * (Vault, AWS Secrets Manager, Azure Key Vault) are supported by
 * implementing the SecretsProvider interface from secrets-manager.ts and
 * passing the instance to initializeSecretsManager().
 */

export * from './secrets-manager.js';
export * from './secret-lifecycle.js';
export * from './rotation-strategies.js';
export * from './providers/env-provider.js';

import { SecretsProvider } from './secrets-manager.js';
import { EnvironmentProvider } from './providers/env-provider.js';

/**
 * Create the secrets provider from environment configuration.
 *
 * Only the environment provider is built in. If SECRETS_PROVIDER names an
 * external manager, fail loudly instead of silently falling back.
 */
export async function createSecretsProvider(): Promise<SecretsProvider> {
  const providerType = process.env.SECRETS_PROVIDER?.toLowerCase();

  if (providerType && providerType !== 'env' && providerType !== 'environment') {
    throw new Error(
      `SECRETS_PROVIDER='${providerType}' is not built in. ` +
        'Implement the SecretsProvider interface (src/secrets/secrets-manager.ts) ' +
        'and pass it to initializeSecretsManager(), or unset SECRETS_PROVIDER.'
    );
  }

  return new EnvironmentProvider();
}

/**
 * Log secrets provider status
 */
export function logSecretsStatus(providerName: string): void {
  console.log('🔒 Secrets Management Configuration:');

  if (providerName === 'environment') {
    console.log('   Provider: Environment Variables');
    console.log('   💡 Tip: For an external manager, implement the SecretsProvider interface');
  } else {
    console.log(`   ✅ Provider: ${providerName} (custom)`);
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
