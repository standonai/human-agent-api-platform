/**
 * Gateway Factory
 *
 * Creates appropriate gateway instance based on configuration.
 * Supports Kong, Apigee, and future providers.
 */

import { ApiGateway, GatewayConfig } from './types.js';
import { KongGateway } from './kong-gateway.js';
import { ApigeeGateway } from './apigee-gateway.js';
import { AWSAPIGateway } from './aws-gateway.js';
import { AzureAPIGateway } from './azure-gateway.js';

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

    case 'aws':
      return new AWSAPIGateway(config);

    case 'azure':
      return new AzureAPIGateway(config);

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

  // Provider-specific configuration
  if (provider === 'apigee') {
    config.extra = {
      organization: process.env.APIGEE_ORGANIZATION,
      environment: process.env.APIGEE_ENVIRONMENT || 'test',
      username: process.env.APIGEE_USERNAME,
      password: process.env.APIGEE_PASSWORD,
      accessToken: process.env.GATEWAY_API_KEY || process.env.APIGEE_ACCESS_TOKEN,
    };
  } else if (provider === 'aws') {
    config.extra = {
      region: process.env.AWS_REGION || process.env.GATEWAY_AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.GATEWAY_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.GATEWAY_AWS_SECRET_ACCESS_KEY,
      apiType: process.env.AWS_API_TYPE || 'HTTP',
      stageName: process.env.AWS_STAGE_NAME || '$default',
      AWS_REGION: process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    };
  } else if (provider === 'azure') {
    config.extra = {
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || process.env.GATEWAY_AZURE_SUBSCRIPTION_ID,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP || process.env.GATEWAY_AZURE_RESOURCE_GROUP,
      serviceName: process.env.AZURE_APIM_SERVICE_NAME || process.env.GATEWAY_AZURE_SERVICE_NAME,
      tenantId: process.env.AZURE_TENANT_ID,
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    };
  }

  return config;
}
