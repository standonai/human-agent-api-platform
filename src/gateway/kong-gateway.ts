/**
 * Kong API Gateway Integration
 *
 * Integrates with Kong Gateway via Admin API.
 * Supports automatic OpenAPI spec sync and plugin management.
 */

import {
  ApiGateway,
  GatewayConfig,
  GatewayPlugin,
  GatewayRoute,
  GatewayService,
  SyncResult,
} from './types.js';

export class KongGateway implements ApiGateway {
  readonly provider = 'kong';
  private adminUrl: string;
  private apiKey?: string;
  private serviceName: string;

  constructor(config: GatewayConfig) {
    if (!config.adminUrl) {
      throw new Error('Kong admin URL is required');
    }

    this.adminUrl = config.adminUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.serviceName = config.serviceName || 'api-platform';
  }

  /**
   * Health check - verify Kong is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request('GET', '/status');
      return response.database?.reachable === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get gateway status
   */
  async getStatus(): Promise<{
    healthy: boolean;
    version?: string;
    services?: number;
    routes?: number;
  }> {
    try {
      const [status, services, routes] = await Promise.all([
        this.request('GET', '/status'),
        this.request('GET', '/services'),
        this.request('GET', '/routes'),
      ]);

      return {
        healthy: status.database?.reachable === true,
        version: status.server?.version,
        services: services.data?.length || 0,
        routes: routes.data?.length || 0,
      };
    } catch (error) {
      return { healthy: false };
    }
  }

  /**
   * Sync OpenAPI spec to Kong
   */
  async syncOpenAPISpec(spec: any): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      servicesCreated: 0,
      routesCreated: 0,
      pluginsConfigured: 0,
      errors: [],
      warnings: [],
    };

    try {
      // 1. Create/update main service
      const serviceUrl = spec.servers?.[0]?.url || 'http://localhost:3000';
      await this.upsertService({
        name: this.serviceName,
        url: serviceUrl,
        retries: 5,
        connectTimeout: 60000,
        readTimeout: 60000,
        writeTimeout: 60000,
      });
      result.servicesCreated++;

      // 2. Create routes for each path
      for (const [path, pathItem] of Object.entries(spec.paths || {})) {
        const methods = Object.keys(pathItem as any).filter((m) =>
          ['get', 'post', 'put', 'patch', 'delete'].includes(m.toLowerCase())
        );

        if (methods.length > 0) {
          const routeName = `${this.serviceName}-${path.replace(/\//g, '-').replace(/[{}]/g, '')}`;

          try {
            await this.upsertRoute({
              name: routeName,
              paths: [path],
              methods: methods.map((m) => m.toUpperCase()),
              service: this.serviceName,
              stripPath: false,
              preserveHost: true,
            });
            result.routesCreated++;
          } catch (error: any) {
            result.warnings.push(`Failed to create route ${routeName}: ${error.message}`);
          }
        }
      }

      // 3. Configure default plugins
      try {
        // Rate limiting plugin
        await this.configurePlugin({
          name: 'rate-limiting',
          enabled: true,
          config: {
            minute: 100,
            policy: 'local',
            fault_tolerant: true,
          },
        });
        result.pluginsConfigured++;

        // CORS plugin
        await this.configurePlugin({
          name: 'cors',
          enabled: true,
          config: {
            origins: ['*'],
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            headers: ['Accept', 'Content-Type', 'Authorization', 'API-Version', 'X-Agent-ID'],
            exposed_headers: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
            credentials: true,
            max_age: 3600,
          },
        });
        result.pluginsConfigured++;

        // Request ID plugin
        await this.configurePlugin({
          name: 'correlation-id',
          enabled: true,
          config: {
            header_name: 'X-Request-ID',
            generator: 'uuid',
            echo_downstream: true,
          },
        });
        result.pluginsConfigured++;
      } catch (error: any) {
        result.warnings.push(`Plugin configuration warning: ${error.message}`);
      }
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Create or update a service
   */
  async upsertService(service: GatewayService): Promise<void> {
    try {
      // Try to get existing service
      await this.request('GET', `/services/${service.name}`);

      // Update if exists
      await this.request('PATCH', `/services/${service.name}`, {
        url: service.url,
        protocol: service.protocol,
        retries: service.retries,
        connect_timeout: service.connectTimeout,
        read_timeout: service.readTimeout,
        write_timeout: service.writeTimeout,
      });
    } catch (error) {
      // Create if doesn't exist
      await this.request('POST', '/services', {
        name: service.name,
        url: service.url,
        protocol: service.protocol,
        retries: service.retries,
        connect_timeout: service.connectTimeout,
        read_timeout: service.readTimeout,
        write_timeout: service.writeTimeout,
      });
    }
  }

  /**
   * Create or update a route
   */
  async upsertRoute(route: GatewayRoute): Promise<void> {
    try {
      // Try to get existing route
      await this.request('GET', `/routes/${route.name}`);

      // Update if exists
      await this.request('PATCH', `/routes/${route.name}`, {
        paths: route.paths,
        methods: route.methods,
        strip_path: route.stripPath,
        preserve_host: route.preserveHost,
      });
    } catch (error) {
      // Create if doesn't exist
      await this.request('POST', `/services/${route.service}/routes`, {
        name: route.name,
        paths: route.paths,
        methods: route.methods,
        strip_path: route.stripPath,
        preserve_host: route.preserveHost,
      });
    }
  }

  /**
   * Configure a plugin
   */
  async configurePlugin(plugin: GatewayPlugin): Promise<void> {
    try {
      // Check if plugin exists for service
      const plugins = await this.request('GET', `/services/${this.serviceName}/plugins`);
      const existing = plugins.data?.find((p: any) => p.name === plugin.name);

      if (existing) {
        // Update existing plugin
        await this.request('PATCH', `/plugins/${existing.id}`, {
          enabled: plugin.enabled,
          config: plugin.config,
        });
      } else {
        // Create new plugin
        await this.request('POST', `/services/${this.serviceName}/plugins`, {
          name: plugin.name,
          enabled: plugin.enabled,
          config: plugin.config,
        });
      }
    } catch (error: any) {
      throw new Error(`Failed to configure plugin ${plugin.name}: ${error.message}`);
    }
  }

  /**
   * Make HTTP request to Kong Admin API
   */
  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.adminUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Kong-Admin-Token'] = this.apiKey;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Kong API error (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return {};
    }

    return response.json();
  }
}
