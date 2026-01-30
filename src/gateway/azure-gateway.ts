/**
 * Azure API Management Integration
 *
 * Integrates with Azure API Management (APIM) service.
 * Uses Azure Management REST API.
 */

import {
  ApiGateway,
  GatewayConfig,
  GatewayPlugin,
  GatewayRoute,
  GatewayService,
  SyncResult,
} from './types.js';

interface AzureConfig extends GatewayConfig {
  subscriptionId?: string;
  resourceGroup?: string;
  serviceName?: string; // APIM service name
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export class AzureAPIGateway implements ApiGateway {
  readonly provider = 'azure';
  private subscriptionId: string;
  private resourceGroup: string;
  private apimServiceName: string;
  private accessToken?: string;
  private apiName: string;

  constructor(config: AzureConfig) {
    if (!config.extra?.subscriptionId) {
      throw new Error('Azure subscription ID is required');
    }

    if (!config.extra?.resourceGroup) {
      throw new Error('Azure resource group is required');
    }

    if (!config.extra?.serviceName) {
      throw new Error('Azure APIM service name is required');
    }

    this.subscriptionId = config.extra.subscriptionId;
    this.resourceGroup = config.extra.resourceGroup;
    this.apimServiceName = config.extra.serviceName;
    this.apiName = config.serviceName || 'api-platform';

    // Authentication
    if (config.apiKey) {
      this.accessToken = config.apiKey;
    } else if (config.extra?.tenantId && config.extra?.clientId && config.extra?.clientSecret) {
      // Would get OAuth token from Azure AD
      // For now, require bearer token
      throw new Error('Azure authentication requires access token');
    } else {
      throw new Error('Azure access token is required');
    }
  }

  /**
   * Health check - verify Azure APIM is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getAPIMService();
      return true;
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
      const service = await this.getAPIMService();
      const apis = await this.listAPIs();

      return {
        healthy: true,
        version: `Azure APIM ${service.sku?.name || 'Unknown'}`,
        services: apis.length,
        routes: 0,
      };
    } catch (error) {
      return { healthy: false };
    }
  }

  /**
   * Sync OpenAPI spec to Azure APIM
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
      // 1. Create or update API from OpenAPI spec
      await this.importOpenAPISpec(spec);
      result.servicesCreated++;
      result.routesCreated = Object.keys(spec.paths || {}).length;

      // 2. Configure policies
      await this.configurePolicies();
      result.pluginsConfigured = 3; // CORS, Rate limit, Response headers

      result.success = true;
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Import OpenAPI specification
   */
  private async importOpenAPISpec(spec: any): Promise<void> {
    const url = this.getManagementUrl(`/apis/${this.apiName}`);

    // Azure APIM can import OpenAPI directly
    await this.azureRequest('PUT', url, {
      properties: {
        format: 'openapi+json',
        value: JSON.stringify(spec),
        path: '/',
        displayName: spec.info?.title || this.apiName,
        protocols: ['https'],
        subscriptionRequired: false,
      },
    });
  }

  /**
   * Configure APIM policies
   */
  private async configurePolicies(): Promise<void> {
    const policyXml = `
<policies>
  <inbound>
    <!-- CORS Policy -->
    <cors allow-credentials="true">
      <allowed-origins>
        <origin>*</origin>
      </allowed-origins>
      <allowed-methods>
        <method>GET</method>
        <method>POST</method>
        <method>PUT</method>
        <method>PATCH</method>
        <method>DELETE</method>
        <method>OPTIONS</method>
      </allowed-methods>
      <allowed-headers>
        <header>Content-Type</header>
        <header>Authorization</header>
        <header>API-Version</header>
        <header>X-Agent-ID</header>
      </allowed-headers>
      <expose-headers>
        <header>X-RateLimit-Limit</header>
        <header>X-RateLimit-Remaining</header>
        <header>X-RateLimit-Reset</header>
      </expose-headers>
    </cors>

    <!-- Rate Limiting -->
    <rate-limit calls="100" renewal-period="60" />

    <!-- Set Backend URL -->
    <set-backend-service base-url="{{backend-url}}" />
  </inbound>

  <backend>
    <forward-request />
  </backend>

  <outbound>
    <!-- Add Response Headers -->
    <set-header name="X-Request-ID" exists-action="override">
      <value>@(context.RequestId)</value>
    </set-header>
  </outbound>

  <on-error>
    <base />
  </on-error>
</policies>`;

    const url = this.getManagementUrl(`/apis/${this.apiName}/policies/policy`);

    await this.azureRequest('PUT', url, {
      properties: {
        value: policyXml,
        format: 'xml',
      },
    });
  }

  /**
   * Get APIM service details
   */
  private async getAPIMService(): Promise<any> {
    const url = this.getManagementUrl('');
    return this.azureRequest('GET', url);
  }

  /**
   * List APIs in APIM
   */
  private async listAPIs(): Promise<any[]> {
    const url = this.getManagementUrl('/apis');
    const response = await this.azureRequest('GET', url);
    return response.value || [];
  }

  /**
   * Create or update a service (not used - APIs are services in Azure)
   */
  async upsertService(_service: GatewayService): Promise<void> {
    console.warn('Azure APIM creates APIs, not services');
  }

  /**
   * Create or update a route (handled by OpenAPI import)
   */
  async upsertRoute(_route: GatewayRoute): Promise<void> {
    console.warn('Routes are configured via OpenAPI import in Azure');
  }

  /**
   * Configure a plugin (Azure uses policies)
   */
  async configurePlugin(plugin: GatewayPlugin): Promise<void> {
    console.warn(`Azure policy configuration: ${plugin.name}`);
    // Policies are configured via XML in configurePolicies()
  }

  /**
   * Get Azure Management API URL
   */
  private getManagementUrl(path: string): string {
    return `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.ApiManagement/service/${this.apimServiceName}${path}?api-version=2021-08-01`;
  }

  /**
   * Make Azure Management API request
   */
  private async azureRequest(method: string, url: string, body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };

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
      throw new Error(`Azure APIM error (${response.status}): ${text}`);
    }

    if (response.status === 204 || response.status === 202) {
      return {};
    }

    return response.json();
  }
}
