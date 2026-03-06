/**
 * Gateway Manager
 *
 * Manages gateway lifecycle: initialization, health checks, sync.
 * Simple, focused, effective.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { load as parseYaml } from 'js-yaml';
import { ApiGateway, GatewayConfig, SyncResult } from './types.js';
import { createGateway, loadGatewayConfig } from './gateway-factory.js';

export class GatewayManager {
  private gateway: ApiGateway | null = null;
  private config: GatewayConfig;

  constructor(config?: GatewayConfig) {
    this.config = config || loadGatewayConfig();
    this.gateway = createGateway(this.config);
  }

  /**
   * Check if gateway is configured
   */
  isEnabled(): boolean {
    return this.gateway !== null;
  }

  /**
   * Get gateway instance
   */
  getGateway(): ApiGateway | null {
    return this.gateway;
  }

  /**
   * Initialize gateway connection
   */
  async initialize(): Promise<void> {
    if (!this.gateway) {
      console.log('⚠️  No gateway configured (set GATEWAY_PROVIDER to enable)');
      return;
    }

    console.log(`🌐 Connecting to ${this.config.provider} gateway...`);

    try {
      const healthy = await this.gateway.healthCheck();
      if (!healthy) {
        throw new Error('Gateway health check failed');
      }

      const status = await this.gateway.getStatus();
      console.log(`✅ Gateway connected: ${this.config.provider}`);
      console.log(`   Version: ${status.version || 'unknown'}`);
      console.log(`   Services: ${status.services || 0}`);
      console.log(`   Routes: ${status.routes || 0}`);

      // Auto-sync if enabled
      if (this.config.autoSync) {
        await this.syncOpenAPISpec();
      }
    } catch (error: any) {
      console.error(`❌ Gateway connection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync OpenAPI spec to gateway
   */
  async syncOpenAPISpec(specPath?: string): Promise<SyncResult> {
    if (!this.gateway) {
      return {
        success: false,
        servicesCreated: 0,
        routesCreated: 0,
        pluginsConfigured: 0,
        errors: ['Gateway not configured'],
        warnings: [],
      };
    }

    console.log('📡 Syncing OpenAPI spec to gateway...');

    try {
      // Load OpenAPI spec
      const spec = this.loadOpenAPISpec(specPath);

      // Sync to gateway
      const result = await this.gateway.syncOpenAPISpec(spec);

      if (result.success) {
        console.log(`✅ Sync complete:`);
        console.log(`   Services: ${result.servicesCreated}`);
        console.log(`   Routes: ${result.routesCreated}`);
        console.log(`   Plugins: ${result.pluginsConfigured}`);

        if (result.warnings.length > 0) {
          console.warn(`⚠️  Warnings: ${result.warnings.length}`);
          result.warnings.forEach((w) => console.warn(`   - ${w}`));
        }
      } else {
        console.error('❌ Sync failed');
        result.errors.forEach((e) => console.error(`   - ${e}`));
      }

      return result;
    } catch (error: any) {
      console.error(`❌ Sync error: ${error.message}`);
      return {
        success: false,
        servicesCreated: 0,
        routesCreated: 0,
        pluginsConfigured: 0,
        errors: [error.message],
        warnings: [],
      };
    }
  }

  /**
   * Get gateway health status
   */
  async getHealth(): Promise<{
    enabled: boolean;
    healthy: boolean;
    provider?: string;
    version?: string;
  }> {
    if (!this.gateway) {
      return { enabled: false, healthy: false };
    }

    const healthy = await this.gateway.healthCheck();
    const status = healthy ? await this.gateway.getStatus() : null;

    return {
      enabled: true,
      healthy,
      provider: this.config.provider,
      version: status?.version,
    };
  }

  /**
   * Load OpenAPI spec from file
   */
  private loadOpenAPISpec(specPath?: string): any {
    const path =
      specPath ||
      process.env.OPENAPI_SPEC_PATH ||
      resolve(process.cwd(), 'specs/openapi/platform-api.yaml');

    try {
      const content = readFileSync(path, 'utf-8');

      // Parse YAML (simple parser for basic YAML)
      if (path.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        return this.parseYAML(content, path);
      }
    } catch (error: any) {
      throw new Error(`Failed to load OpenAPI spec from ${path}: ${error.message}`);
    }
  }

  private parseYAML(content: string, path: string): any {
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Parsed YAML is not a valid object: ${path}`);
    }
    return parsed;
  }
}

// Singleton instance
let gatewayManager: GatewayManager | null = null;

/**
 * Get or create gateway manager instance
 */
export function getGatewayManager(): GatewayManager {
  if (!gatewayManager) {
    gatewayManager = new GatewayManager();
  }
  return gatewayManager;
}
