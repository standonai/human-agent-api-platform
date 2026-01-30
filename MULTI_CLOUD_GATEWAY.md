# Multi-Cloud Gateway Integration

## Overview

The API Platform supports **multi-cloud gateway deployment**, allowing you to sync your OpenAPI specifications to multiple API gateway providers simultaneously. This enables:

- **Hybrid cloud deployments** - Deploy to Kong on-premises + AWS in cloud
- **Multi-region redundancy** - Deploy to AWS us-east-1 + Azure westus2
- **Provider flexibility** - Avoid vendor lock-in by deploying to multiple providers
- **Migration scenarios** - Run Kong + Apigee during migration periods
- **Development workflows** - Test with local Kong, deploy to AWS/Azure in production

## Supported Providers

| Provider | Type | Best For |
|----------|------|----------|
| **Kong** | Open-source | Local dev, Kubernetes, microservices |
| **Apigee** | Enterprise (Google) | GCP integration, developer portals, analytics |
| **AWS API Gateway** | Cloud-native (AWS) | AWS ecosystem, serverless, Lambda integration |
| **Azure APIM** | Cloud-native (Azure) | Azure ecosystem, enterprise features |

## Quick Start

### Single Gateway

Deploy to one provider:

```bash
# Kong
GATEWAY_PROVIDER=kong
GATEWAY_ADMIN_URL=http://localhost:8001
GATEWAY_AUTO_SYNC=true

# Start server - automatically syncs to Kong
npm run dev
```

### Multi-Cloud Gateway

Deploy to multiple providers simultaneously:

```bash
# Sync to Kong + AWS + Azure
GATEWAY_PROVIDERS=kong,aws,azure
GATEWAY_AUTO_SYNC=true

# Kong configuration
GATEWAY_KONG_ADMIN_URL=http://localhost:8001

# AWS configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Azure configuration
AZURE_SUBSCRIPTION_ID=your-sub-id
AZURE_RESOURCE_GROUP=your-rg
AZURE_APIM_SERVICE_NAME=your-apim
GATEWAY_AZURE_API_KEY=your-token

# Start server - automatically syncs to all 3 gateways
npm run dev
```

**Output:**
```
🌐 Connecting to multi-cloud gateways...
✅ Kong connected
✅ AWS API Gateway connected
✅ Azure APIM connected

📡 Syncing OpenAPI spec to 3 gateways...

Multi-Gateway Sync Results:
──────────────────────────────────────────────────

✅ KONG
   Services: 1
   Routes: 8
   Plugins: 3

✅ AWS
   Services: 1
   Routes: 8
   Plugins: 0

✅ AZURE
   Services: 1
   Routes: 8
   Plugins: 3

──────────────────────────────────────────────────
Overall: ✅ All syncs successful
```

## Configuration

### Environment Variables

#### Multi-Cloud Mode

Use `GATEWAY_PROVIDERS` (comma-separated) instead of `GATEWAY_PROVIDER`:

```bash
# Single provider
GATEWAY_PROVIDER=kong

# Multiple providers
GATEWAY_PROVIDERS=kong,aws,azure,apigee
```

#### Provider-Specific Configuration

Each provider can have its own admin URL and API key:

```bash
# Global defaults (used if provider-specific not set)
GATEWAY_ADMIN_URL=http://localhost:8001
GATEWAY_API_KEY=global-key

# Provider-specific overrides
GATEWAY_KONG_ADMIN_URL=http://kong.local:8001
GATEWAY_AWS_ADMIN_URL=https://apigateway.us-east-1.amazonaws.com
GATEWAY_AZURE_ADMIN_URL=https://management.azure.com
GATEWAY_APIGEE_ADMIN_URL=https://api.enterprise.apigee.com

GATEWAY_KONG_API_KEY=kong-specific-key
GATEWAY_AWS_API_KEY=aws-specific-key
GATEWAY_AZURE_API_KEY=azure-bearer-token
GATEWAY_APIGEE_API_KEY=apigee-oauth-token
```

### Kong Configuration

```bash
GATEWAY_PROVIDER=kong
GATEWAY_ADMIN_URL=http://localhost:8001
# Optional: If Admin API has authentication
GATEWAY_API_KEY=your-admin-api-key
```

**Features:**
- Live configuration (no deployment needed)
- Service + Route creation
- Plugin configuration (rate-limiting, CORS, response-headers)
- Health checks

### Apigee Configuration

```bash
GATEWAY_PROVIDER=apigee
GATEWAY_ADMIN_URL=https://api.enterprise.apigee.com
APIGEE_ORGANIZATION=my-company
APIGEE_ENVIRONMENT=test

# Authentication (choose one)
GATEWAY_API_KEY=oauth2-bearer-token
# OR
APIGEE_USERNAME=you@example.com
APIGEE_PASSWORD=your-password
```

**Features:**
- OpenAPI import with validation
- Automatic revision creation
- Deployment to environments
- Policy XML generation (Rate Limiting, CORS, Spike Arrest)
- OAuth2 and Basic Auth

**Get OAuth2 Token (GCP Apigee):**
```bash
gcloud auth print-access-token
```

### AWS API Gateway Configuration

```bash
GATEWAY_PROVIDER=aws
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# API Type: HTTP (v2, simpler) or REST (v1, more features)
AWS_API_TYPE=HTTP

# Stage name (HTTP APIs use $default, REST APIs use custom)
AWS_STAGE_NAME=$default
```

**Features:**
- Supports both HTTP API (v2) and REST API (v1)
- OpenAPI 3.0 import with AWS extensions
- Automatic CORS configuration
- Request validation
- Deployment to stages

**API Type Selection:**
- **HTTP API (v2)** - Simpler, cheaper, modern (recommended for new projects)
- **REST API (v1)** - More features, usage plans, API keys, custom domains

### Azure API Management Configuration

```bash
GATEWAY_PROVIDER=azure
AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_RESOURCE_GROUP=my-resource-group
AZURE_APIM_SERVICE_NAME=my-apim-service

# Authentication
GATEWAY_API_KEY=your-bearer-token

# Optional: Service Principal (not yet implemented)
# AZURE_TENANT_ID=your-tenant-id
# AZURE_CLIENT_ID=your-client-id
# AZURE_CLIENT_SECRET=your-secret
```

**Features:**
- OpenAPI import to APIM
- Policy XML configuration (CORS, rate limiting, backend URL)
- Automatic API creation
- Subscription management

**Get Bearer Token:**
```bash
az login
az account get-access-token --query accessToken -o tsv
```

## Multi-Cloud Scenarios

### Scenario 1: Development → Production

**Development (local):**
```bash
GATEWAY_PROVIDER=kong
GATEWAY_ADMIN_URL=http://localhost:8001
```

**Production (multi-cloud):**
```bash
GATEWAY_PROVIDERS=aws,azure
AWS_REGION=us-east-1
AZURE_SUBSCRIPTION_ID=your-id
...
```

### Scenario 2: Multi-Region Deployment

Deploy to AWS in multiple regions:

```bash
# Deploy API to us-east-1 and eu-west-1
# Note: Requires separate API Platform instances with different configs

# Instance 1 (us-east-1)
GATEWAY_PROVIDER=aws
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...

# Instance 2 (eu-west-1)
GATEWAY_PROVIDER=aws
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=...
```

### Scenario 3: Kong + Cloud Provider

Run Kong locally/on-premises, sync to cloud for redundancy:

```bash
GATEWAY_PROVIDERS=kong,aws
GATEWAY_KONG_ADMIN_URL=http://kong.internal:8001
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
```

### Scenario 4: Migration (Apigee → AWS)

Run both during migration period:

```bash
GATEWAY_PROVIDERS=apigee,aws
APIGEE_ORGANIZATION=legacy-org
APIGEE_ENVIRONMENT=prod
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
```

Gradually shift traffic from Apigee to AWS, then remove Apigee.

## Programmatic Usage

### Multi-Gateway Manager

```typescript
import { MultiGatewayManager, loadMultiGatewayConfig } from './gateway';

// Load configuration
const config = loadMultiGatewayConfig();
const manager = new MultiGatewayManager(config);

// Health check all gateways
const health = await manager.healthCheckAll();
for (const [provider, healthy] of health) {
  console.log(`${provider}: ${healthy ? '✅' : '❌'}`);
}

// Sync OpenAPI spec to all gateways
const spec = await loadOpenAPISpec();
const result = await manager.syncOpenAPISpec(spec);

manager.printSyncResults(result);
// Multi-Gateway Sync Results:
// ✅ KONG - Services: 1, Routes: 8, Plugins: 3
// ✅ AWS - Services: 1, Routes: 8
// ✅ AZURE - Services: 1, Routes: 8
```

### Single Gateway

```typescript
import { createGateway, loadGatewayConfig } from './gateway';

const config = loadGatewayConfig();
const gateway = createGateway(config);

if (gateway) {
  const healthy = await gateway.healthCheck();
  const status = await gateway.getStatus();

  const result = await gateway.syncOpenAPISpec(spec);
  console.log(`Synced: ${result.servicesCreated} services, ${result.routesCreated} routes`);
}
```

## CLI Commands

### Sync to Gateways

```bash
# Sync to configured gateway(s)
npm run gateway:sync

# With multi-cloud:
# GATEWAY_PROVIDERS=kong,aws,azure npm run gateway:sync
```

### Check Status

```bash
# Check gateway health and status
npm run gateway:status
```

### Health Check

```bash
# Quick health check
npm run gateway:health
```

## API Endpoints

### Trigger Sync

```bash
POST /api/gateway/sync
```

**Response:**
```json
{
  "data": {
    "success": true,
    "servicesCreated": 3,
    "routesCreated": 24,
    "pluginsConfigured": 9,
    "warnings": [
      "Kong: API already exists, updated",
      "AWS: Deployed to stage $default",
      "Azure: Configured policies"
    ]
  }
}
```

### Get Status

```bash
GET /api/gateway/status
```

**Response:**
```json
{
  "data": {
    "enabled": true,
    "healthy": true,
    "provider": "multi-cloud",
    "gateways": {
      "kong": {
        "healthy": true,
        "version": "3.8.0",
        "services": 1,
        "routes": 8
      },
      "aws": {
        "healthy": true,
        "version": "AWS API Gateway HTTP",
        "services": 1
      },
      "azure": {
        "healthy": true,
        "version": "Azure APIM Developer",
        "services": 1
      }
    }
  }
}
```

## Architecture

### Multi-Cloud Orchestration

```
┌─────────────────────────────────────────┐
│   API Platform (OpenAPI Spec)           │
└───────────────┬─────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│   Multi-Gateway Manager                   │
│   - Parallel sync to all providers        │
│   - Health monitoring                     │
│   - Aggregated status                     │
└───┬───────┬──────────┬────────────────────┘
    │       │          │
    ▼       ▼          ▼
┌──────┐ ┌─────┐ ┌────────┐
│ Kong │ │ AWS │ │ Azure  │
└──────┘ └─────┘ └────────┘
```

### Gateway Abstraction

All gateways implement the same `ApiGateway` interface:

```typescript
interface ApiGateway {
  readonly provider: string;

  healthCheck(): Promise<boolean>;
  getStatus(): Promise<GatewayStatus>;

  syncOpenAPISpec(spec: any): Promise<SyncResult>;
  upsertService(service: GatewayService): Promise<void>;
  upsertRoute(route: GatewayRoute): Promise<void>;
  configurePlugin(plugin: GatewayPlugin): Promise<void>;
}
```

This abstraction allows:
- **Provider-agnostic code** - Same interface for all providers
- **Easy testing** - Mock gateway implementations
- **Future extensibility** - Add new providers (GCP API Gateway, Tyk, etc.)

## Comparison Matrix

| Feature | Kong | Apigee | AWS | Azure |
|---------|------|--------|-----|-------|
| **OpenAPI Import** | ✅ Manual | ✅ Native | ✅ Native | ✅ Native |
| **Auto-Deployment** | ✅ Immediate | ✅ Revision | ✅ Stage | ✅ Immediate |
| **Rate Limiting** | ✅ Plugin | ✅ Policy | ⚠️ Usage Plan | ✅ Policy |
| **CORS** | ✅ Plugin | ✅ Policy | ✅ Integration | ✅ Policy |
| **Authentication** | Admin API | OAuth2/Basic | AWS SigV4 | Bearer Token |
| **Cost** | Free/Enterprise | Enterprise | Pay-per-use | Pay-per-use |
| **Best For** | Local dev, K8s | GCP, Analytics | AWS ecosystem | Azure ecosystem |

## Troubleshooting

### Multi-Cloud Sync Fails Partially

If some gateways succeed and others fail:

```bash
📡 Multi-Gateway Sync Results:
──────────────────────────────────────────────────

✅ KONG
   Services: 1, Routes: 8, Plugins: 3

❌ AWS
   Error: AWS credentials not configured

✅ AZURE
   Services: 1, Routes: 8, Plugins: 3

──────────────────────────────────────────────────
Overall: ⚠️  1 failed
```

**Solution:** The platform continues with successful syncs. Fix the failing provider's configuration and re-run sync.

### Provider-Specific Issues

#### Kong Connection Refused

```
Error: Kong Admin API error (ECONNREFUSED)
```

**Solution:**
```bash
# Verify Kong is running
curl http://localhost:8001

# Check GATEWAY_ADMIN_URL
echo $GATEWAY_ADMIN_URL
```

#### AWS Signature Error

```
Error: AWS API Gateway error (403): Invalid signature
```

**Solution:**
```bash
# Verify credentials
aws configure list

# Use correct region
AWS_REGION=us-east-1
```

#### Azure Unauthorized

```
Error: Azure APIM error (401): Unauthorized
```

**Solution:**
```bash
# Refresh bearer token
az account get-access-token --query accessToken -o tsv

# Update GATEWAY_API_KEY
export GATEWAY_API_KEY=$(az account get-access-token --query accessToken -o tsv)
```

#### Apigee Organization Not Found

```
Error: Apigee API error (404): Organization not found
```

**Solution:**
```bash
# List accessible organizations
curl -H "Authorization: Bearer $GATEWAY_API_KEY" \
  https://api.enterprise.apigee.com/v1/organizations

# Verify organization name
echo $APIGEE_ORGANIZATION
```

## Best Practices

### 1. Use Auto-Sync in Production

```bash
GATEWAY_AUTO_SYNC=true
```

Automatically syncs OpenAPI spec on server startup, ensuring gateways are always up-to-date.

### 2. Separate Dev/Prod Configurations

**Development:**
```bash
GATEWAY_PROVIDER=kong
GATEWAY_ADMIN_URL=http://localhost:8001
```

**Production:**
```bash
GATEWAY_PROVIDERS=aws,azure
AWS_REGION=us-east-1
AZURE_SUBSCRIPTION_ID=...
```

### 3. Monitor Gateway Health

```bash
# Add to monitoring/health checks
curl http://localhost:3000/api/gateway/status

# Returns healthy: true/false for each gateway
```

### 4. Use Provider-Specific Keys

Instead of global `GATEWAY_API_KEY`, use provider-specific keys:

```bash
GATEWAY_KONG_API_KEY=kong-key
GATEWAY_AWS_API_KEY=aws-key
GATEWAY_AZURE_API_KEY=azure-key
```

### 5. Version Your OpenAPI Specs

Keep your OpenAPI spec in version control and sync after changes:

```bash
git commit specs/openapi/platform-api.yaml -m "Add new endpoint"
npm run gateway:sync
```

## Future Enhancements

Planned features:

- **GCP API Gateway** - Native GCP gateway (separate from Apigee)
- **Tyk Gateway** - Another open-source option
- **Selective Sync** - Sync only to specific providers: `npm run gateway:sync -- --providers=aws,azure`
- **Rollback** - Revert to previous OpenAPI spec version
- **Diff Preview** - Show what will change before syncing
- **Webhook Notifications** - Notify on sync completion/failure

## Summary

The multi-cloud gateway integration provides:

- ✅ **4 gateway providers** - Kong, Apigee, AWS, Azure
- ✅ **Single or multi-cloud** - Deploy to one or many simultaneously
- ✅ **Auto-sync** - Automatic sync on server startup
- ✅ **Provider abstraction** - Same interface for all providers
- ✅ **Parallel sync** - Fast multi-cloud synchronization
- ✅ **Health monitoring** - Track status of all gateways
- ✅ **Zero vendor lock-in** - Easy migration between providers

Choose your deployment strategy:
- **Local dev**: Kong
- **AWS ecosystem**: AWS API Gateway
- **Azure ecosystem**: Azure APIM
- **GCP ecosystem**: Apigee
- **Multi-cloud**: Any combination

Configure with environment variables, start your server, and your OpenAPI spec automatically deploys to all configured gateways.

**Next:** See provider-specific guides in `KONG_INTEGRATION.md`, `APIGEE_INTEGRATION.md`, etc.
