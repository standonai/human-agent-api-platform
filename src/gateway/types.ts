/**
 * API Gateway Integration Types
 *
 * Abstraction layer for multiple gateway providers (Kong, Apigee, etc.)
 */

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  /**
   * Gateway provider
   */
  provider: 'kong' | 'apigee' | 'none';

  /**
   * Gateway admin API URL
   */
  adminUrl?: string;

  /**
   * API key or token for admin API
   */
  apiKey?: string;

  /**
   * Auto-sync OpenAPI specs on startup
   */
  autoSync?: boolean;

  /**
   * Service name in gateway
   */
  serviceName?: string;

  /**
   * Additional provider-specific config
   */
  extra?: Record<string, any>;
}

/**
 * Gateway plugin configuration
 */
export interface GatewayPlugin {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

/**
 * Gateway service definition
 */
export interface GatewayService {
  name: string;
  url: string;
  protocol?: 'http' | 'https';
  retries?: number;
  connectTimeout?: number;
  readTimeout?: number;
  writeTimeout?: number;
}

/**
 * Gateway route definition
 */
export interface GatewayRoute {
  name: string;
  paths: string[];
  methods?: string[];
  service: string;
  stripPath?: boolean;
  preserveHost?: boolean;
}

/**
 * Gateway sync result
 */
export interface SyncResult {
  success: boolean;
  servicesCreated: number;
  routesCreated: number;
  pluginsConfigured: number;
  errors: string[];
  warnings: string[];
}

/**
 * Abstract API Gateway interface
 */
export interface ApiGateway {
  /**
   * Provider name
   */
  readonly provider: string;

  /**
   * Health check - verify gateway is reachable
   */
  healthCheck(): Promise<boolean>;

  /**
   * Sync OpenAPI specification to gateway
   */
  syncOpenAPISpec(spec: any): Promise<SyncResult>;

  /**
   * Configure a plugin
   */
  configurePlugin(plugin: GatewayPlugin): Promise<void>;

  /**
   * Create or update a service
   */
  upsertService(service: GatewayService): Promise<void>;

  /**
   * Create or update a route
   */
  upsertRoute(route: GatewayRoute): Promise<void>;

  /**
   * Get gateway status
   */
  getStatus(): Promise<{
    healthy: boolean;
    version?: string;
    services?: number;
    routes?: number;
  }>;
}
