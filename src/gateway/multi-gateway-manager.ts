/**
 * Multi-Gateway Manager
 *
 * Orchestrates synchronization across multiple gateway providers simultaneously.
 * Enables syncing OpenAPI specs to Kong + AWS + Azure + Apigee in parallel.
 */

import { ApiGateway, GatewayConfig, SyncResult } from './types.js';
import { createGateway } from './gateway-factory.js';

export interface MultiGatewayConfig {
  gateways: GatewayConfig[];
  autoSync?: boolean;
  serviceName?: string;
}

export interface MultiGatewaySyncResult {
  success: boolean;
  results: Map<string, SyncResult>;
  errors: Map<string, string>;
}

/**
 * Multi-Gateway Manager
 *
 * Manages multiple gateway instances and orchestrates operations across them.
 */
export class MultiGatewayManager {
  private gateways: Map<string, ApiGateway> = new Map();

  constructor(config: MultiGatewayConfig) {
    // Initialize all gateways
    for (const gatewayConfig of config.gateways) {
      const gateway = createGateway(gatewayConfig);
      if (gateway) {
        this.gateways.set(gateway.provider, gateway);
      }
    }
  }

  /**
   * Get all active gateways
   */
  getGateways(): ApiGateway[] {
    return Array.from(this.gateways.values());
  }

  /**
   * Get gateway by provider
   */
  getGateway(provider: string): ApiGateway | undefined {
    return this.gateways.get(provider);
  }

  /**
   * Health check all gateways
   */
  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const checks = Array.from(this.gateways.entries()).map(async ([provider, gateway]) => {
      try {
        const healthy = await gateway.healthCheck();
        results.set(provider, healthy);
      } catch (error) {
        results.set(provider, false);
      }
    });

    await Promise.allSettled(checks);
    return results;
  }

  /**
   * Get status from all gateways
   */
  async getStatusAll(): Promise<
    Map<
      string,
      {
        healthy: boolean;
        version?: string;
        services?: number;
        routes?: number;
      }
    >
  > {
    const results = new Map();

    const checks = Array.from(this.gateways.entries()).map(async ([provider, gateway]) => {
      try {
        const status = await gateway.getStatus();
        results.set(provider, status);
      } catch (error) {
        results.set(provider, { healthy: false });
      }
    });

    await Promise.allSettled(checks);
    return results;
  }

  /**
   * Sync OpenAPI spec to all gateways
   */
  async syncOpenAPISpec(spec: any): Promise<MultiGatewaySyncResult> {
    const results = new Map<string, SyncResult>();
    const errors = new Map<string, string>();

    const syncs = Array.from(this.gateways.entries()).map(async ([provider, gateway]) => {
      try {
        const result = await gateway.syncOpenAPISpec(spec);
        results.set(provider, result);

        if (!result.success) {
          errors.set(provider, result.errors.join(', '));
        }
      } catch (error: any) {
        errors.set(provider, error.message);
        results.set(provider, {
          success: false,
          servicesCreated: 0,
          routesCreated: 0,
          pluginsConfigured: 0,
          errors: [error.message],
          warnings: [],
        });
      }
    });

    await Promise.allSettled(syncs);

    return {
      success: errors.size === 0,
      results,
      errors,
    };
  }

  /**
   * Print sync results summary
   */
  printSyncResults(result: MultiGatewaySyncResult): void {
    console.log('\n📡 Multi-Gateway Sync Results:');
    console.log('─'.repeat(50));

    for (const [provider, syncResult] of result.results) {
      const icon = syncResult.success ? '✅' : '❌';
      console.log(`\n${icon} ${provider.toUpperCase()}`);

      if (syncResult.success) {
        console.log(`   Services: ${syncResult.servicesCreated}`);
        console.log(`   Routes: ${syncResult.routesCreated}`);
        console.log(`   Plugins: ${syncResult.pluginsConfigured}`);

        if (syncResult.warnings.length > 0) {
          console.log(`   Warnings: ${syncResult.warnings.length}`);
          syncResult.warnings.forEach((warning) => {
            console.log(`     ⚠️  ${warning}`);
          });
        }
      } else {
        console.log(`   Error: ${result.errors.get(provider)}`);
        syncResult.errors.forEach((error) => {
          console.log(`     • ${error}`);
        });
      }
    }

    console.log('\n' + '─'.repeat(50));
    console.log(
      `Overall: ${result.success ? '✅ All syncs successful' : `⚠️  ${result.errors.size} failed`}`
    );
  }

  /**
   * Print status summary
   */
  async printStatus(): Promise<void> {
    const statuses = await this.getStatusAll();

    console.log('\n🌐 Multi-Gateway Status:');
    console.log('─'.repeat(50));

    for (const [provider, status] of statuses) {
      const icon = status.healthy ? '✅' : '❌';
      console.log(`\n${icon} ${provider.toUpperCase()}`);

      if (status.healthy) {
        if (status.version) console.log(`   Version: ${status.version}`);
        if (status.services !== undefined) console.log(`   Services: ${status.services}`);
        if (status.routes !== undefined) console.log(`   Routes: ${status.routes}`);
      } else {
        console.log('   Status: Unhealthy');
      }
    }

    console.log('\n' + '─'.repeat(50));
  }
}

/**
 * Load multi-gateway configuration from environment
 */
export function loadMultiGatewayConfig(): MultiGatewayConfig {
  const providers = (process.env.GATEWAY_PROVIDERS || process.env.GATEWAY_PROVIDER || 'none').split(
    ','
  );

  const gateways: GatewayConfig[] = [];

  for (const provider of providers) {
    const trimmedProvider = provider.trim() as GatewayConfig['provider'];

    if (trimmedProvider === 'none' || !trimmedProvider) {
      continue;
    }

    const config: GatewayConfig = {
      provider: trimmedProvider,
      adminUrl: process.env[`GATEWAY_${trimmedProvider.toUpperCase()}_ADMIN_URL`] || process.env.GATEWAY_ADMIN_URL,
      apiKey: process.env[`GATEWAY_${trimmedProvider.toUpperCase()}_API_KEY`] || process.env.GATEWAY_API_KEY,
      autoSync: process.env.GATEWAY_AUTO_SYNC === 'true',
      serviceName: process.env.GATEWAY_SERVICE_NAME || 'api-platform',
    };

    // Provider-specific configuration
    if (trimmedProvider === 'apigee') {
      config.extra = {
        organization: process.env.APIGEE_ORGANIZATION,
        environment: process.env.APIGEE_ENVIRONMENT || 'test',
        username: process.env.APIGEE_USERNAME,
        password: process.env.APIGEE_PASSWORD,
        accessToken: config.apiKey || process.env.APIGEE_ACCESS_TOKEN,
      };
    } else if (trimmedProvider === 'aws') {
      config.extra = {
        region: process.env.AWS_REGION || process.env.GATEWAY_AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.GATEWAY_AWS_ACCESS_KEY_ID,
        secretAccessKey:
          process.env.AWS_SECRET_ACCESS_KEY || process.env.GATEWAY_AWS_SECRET_ACCESS_KEY,
        apiType: process.env.AWS_API_TYPE || 'HTTP',
        stageName: process.env.AWS_STAGE_NAME || '$default',
        AWS_REGION: process.env.AWS_REGION,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      };
    } else if (trimmedProvider === 'azure') {
      config.extra = {
        subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || process.env.GATEWAY_AZURE_SUBSCRIPTION_ID,
        resourceGroup: process.env.AZURE_RESOURCE_GROUP || process.env.GATEWAY_AZURE_RESOURCE_GROUP,
        serviceName:
          process.env.AZURE_APIM_SERVICE_NAME || process.env.GATEWAY_AZURE_SERVICE_NAME,
        tenantId: process.env.AZURE_TENANT_ID,
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      };
    }

    gateways.push(config);
  }

  return {
    gateways,
    autoSync: process.env.GATEWAY_AUTO_SYNC === 'true',
    serviceName: process.env.GATEWAY_SERVICE_NAME || 'api-platform',
  };
}
