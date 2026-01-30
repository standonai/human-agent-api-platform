/**
 * Gateway Factory
 *
 * Creates appropriate gateway instance based on configuration.
 * Supports Kong, Apigee, and future providers.
 */

import { ApiGateway, GatewayConfig } from './types.js';
import { KongGateway } from './kong-gateway.js';
import { ApigeeGateway } from './apigee-gateway.js';

/**
 * Create gateway instance from configuration
 */
export function createGateway(config: GatewayConfig): ApiGateway | null {
  if (config.provider === 'none' || !config.provider) {
    return null;
  }

  switch (config.provider) {
    case 'kong':
      return new KongGateway(config);

    case 'apigee':
      return new ApigeeGateway(config);

    default:
      throw new Error(`Unknown gateway provider: ${config.provider}`);
  }
}

/**
 * Load gateway configuration from environment
 */
export function loadGatewayConfig(): GatewayConfig {
  const provider = (process.env.GATEWAY_PROVIDER || 'none') as GatewayConfig['provider'];

  const config: GatewayConfig = {
    provider,
    adminUrl: process.env.GATEWAY_ADMIN_URL,
    apiKey: process.env.GATEWAY_API_KEY,
    autoSync: process.env.GATEWAY_AUTO_SYNC === 'true',
    serviceName: process.env.GATEWAY_SERVICE_NAME || 'api-platform',
  };

  // Apigee-specific configuration
  if (provider === 'apigee') {
    config.extra = {
      organization: process.env.APIGEE_ORGANIZATION,
      environment: process.env.APIGEE_ENVIRONMENT || 'test',
      username: process.env.APIGEE_USERNAME,
      password: process.env.APIGEE_PASSWORD,
      accessToken: process.env.GATEWAY_API_KEY || process.env.APIGEE_ACCESS_TOKEN,
    };
  }

  return config;
}
