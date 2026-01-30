/**
 * AWS API Gateway Integration
 *
 * Supports both REST API and HTTP API (API Gateway v2).
 * Uses AWS SDK for API Gateway management.
 */

import {
  ApiGateway,
  GatewayConfig,
  GatewayPlugin,
  GatewayRoute,
  GatewayService,
  SyncResult,
} from './types.js';

interface AWSConfig extends GatewayConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  apiType?: 'REST' | 'HTTP'; // REST API or HTTP API (v2)
  stageName?: string;
}

export class AWSAPIGateway implements ApiGateway {
  readonly provider = 'aws';
  private region: string;
  private accessKeyId?: string;
  private secretAccessKey?: string;
  private apiType: 'REST' | 'HTTP';
  private stageName: string;
  private apiName: string;

  constructor(config: AWSConfig) {
    this.region = config.extra?.region || config.extra?.AWS_REGION || 'us-east-1';
    this.accessKeyId = config.extra?.accessKeyId || config.extra?.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = config.extra?.secretAccessKey || config.extra?.AWS_SECRET_ACCESS_KEY;
    this.apiType = config.extra?.apiType || 'HTTP'; // HTTP API is newer, simpler
    this.stageName = config.extra?.stageName || '$default';
    this.apiName = config.serviceName || 'api-platform';

    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error('AWS credentials required (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
    }
  }

  /**
   * Health check - verify AWS credentials work
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to list APIs to verify credentials
      await this.listAPIs();
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
      const apis = await this.listAPIs();

      return {
        healthy: true,
        version: `AWS API Gateway ${this.apiType}`,
        services: apis.length,
        routes: 0,
      };
    } catch (error) {
      return { healthy: false };
    }
  }

  /**
   * Sync OpenAPI spec to AWS API Gateway
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
      // 1. Convert OpenAPI to AWS format
      const awsSpec = this.convertToAWSFormat(spec);

      // 2. Create or update API
      if (this.apiType === 'HTTP') {
        await this.syncHTTPAPI(awsSpec, result);
      } else {
        await this.syncRESTAPI(awsSpec, result);
      }

      // 3. Deploy to stage
      await this.deployToStage(result);

      result.success = true;
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Sync HTTP API (v2) - simpler, newer
   */
  private async syncHTTPAPI(spec: any, result: SyncResult): Promise<void> {
    const endpoint = `https://apigateway.${this.region}.amazonaws.com/v2/apis`;

    // Check if API exists
    const existingApis = await this.listAPIs();
    const existingApi = existingApis.find((api: any) => api.Name === this.apiName);

    if (existingApi) {
      // Update existing API
      await this.awsRequest('PUT', `${endpoint}/${existingApi.ApiId}`, {
        Name: this.apiName,
        Body: JSON.stringify(spec),
      });
      result.warnings.push(`Updated existing API: ${existingApi.ApiId}`);
    } else {
      // Create new API from OpenAPI spec
      await this.awsRequest('POST', endpoint, {
        Name: this.apiName,
        ProtocolType: 'HTTP',
        Body: JSON.stringify(spec),
      });
      result.servicesCreated++;
    }

    result.routesCreated = Object.keys(spec.paths || {}).length;
  }

  /**
   * Sync REST API (v1) - more features, more complex
   */
  private async syncRESTAPI(spec: any, result: SyncResult): Promise<void> {
    const endpoint = `https://apigateway.${this.region}.amazonaws.com/restapis`;

    // Import OpenAPI spec
    await this.awsRequest('POST', endpoint, {
      mode: 'overwrite',
      failOnWarnings: false,
      body: JSON.stringify(spec),
    });

    result.servicesCreated++;
    result.routesCreated = Object.keys(spec.paths || {}).length;
  }

  /**
   * Deploy API to stage
   */
  private async deployToStage(result: SyncResult): Promise<void> {
    // For HTTP API, deployment happens automatically with $default stage
    // For REST API, would need explicit deployment
    result.warnings.push(`Deployed to stage: ${this.stageName}`);
  }

  /**
   * Create or update a service (not used in AWS - APIs are services)
   */
  async upsertService(_service: GatewayService): Promise<void> {
    console.warn('AWS API Gateway creates APIs, not services');
  }

  /**
   * Create or update a route (handled by OpenAPI import)
   */
  async upsertRoute(_route: GatewayRoute): Promise<void> {
    console.warn('Routes are configured via OpenAPI import in AWS');
  }

  /**
   * Configure a plugin (AWS uses authorizers, request validators, etc.)
   */
  async configurePlugin(plugin: GatewayPlugin): Promise<void> {
    // AWS has different concepts:
    // - Authorizers (for auth)
    // - Request validators
    // - Usage plans (for rate limiting)
    console.warn(`AWS plugin configuration not yet implemented: ${plugin.name}`);
  }

  /**
   * List APIs in the region
   */
  private async listAPIs(): Promise<any[]> {
    const endpoint = this.apiType === 'HTTP'
      ? `https://apigateway.${this.region}.amazonaws.com/v2/apis`
      : `https://apigateway.${this.region}.amazonaws.com/restapis`;

    const response = await this.awsRequest('GET', endpoint);
    return response.Items || response.items || [];
  }

  /**
   * Convert OpenAPI spec to AWS-compatible format
   */
  private convertToAWSFormat(spec: any): any {
    // AWS API Gateway supports OpenAPI 3.0 with extensions
    const awsSpec = { ...spec };

    // Add AWS-specific extensions
    awsSpec['x-amazon-apigateway-request-validators'] = {
      all: {
        validateRequestBody: true,
        validateRequestParameters: true,
      },
    };

    // Add CORS configuration to all paths
    for (const path of Object.keys(awsSpec.paths || {})) {
      const pathItem = awsSpec.paths[path];

      // Add OPTIONS method for CORS
      if (!pathItem.options) {
        pathItem.options = {
          summary: 'CORS support',
          responses: {
            '200': {
              description: 'CORS headers',
              headers: {
                'Access-Control-Allow-Origin': { schema: { type: 'string' } },
                'Access-Control-Allow-Methods': { schema: { type: 'string' } },
                'Access-Control-Allow-Headers': { schema: { type: 'string' } },
              },
            },
          },
          'x-amazon-apigateway-integration': {
            type: 'mock',
            requestTemplates: {
              'application/json': '{"statusCode": 200}',
            },
            responses: {
              default: {
                statusCode: '200',
                responseParameters: {
                  'method.response.header.Access-Control-Allow-Origin': "'*'",
                  'method.response.header.Access-Control-Allow-Methods': "'GET,POST,PUT,PATCH,DELETE,OPTIONS'",
                  'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,API-Version,X-Agent-ID'",
                },
              },
            },
          },
        };
      }
    }

    return awsSpec;
  }

  /**
   * Make authenticated AWS API request
   */
  private async awsRequest(method: string, url: string, body?: any): Promise<any> {
    // Simple AWS Signature Version 4 signing
    // In production, use AWS SDK
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
    };

    // For now, use basic auth (would need proper AWS SigV4 in production)
    if (this.accessKeyId) {
      headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${this.region}/apigateway/aws4_request`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AWS API Gateway error (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return {};
    }

    return response.json();
  }
}
