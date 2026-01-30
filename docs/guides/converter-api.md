# Converter API Reference

Real-time OpenAPI to AI Agent Tool conversion API.

## Base URL

```
http://localhost:3002/api
```

## Endpoints

### POST /convert

Convert an OpenAPI specification to AI agent tool definitions.

**Request Body:**

```typescript
{
  spec: object;           // OpenAPI 3.x specification
  format?: string;        // 'openai' | 'anthropic' | 'both' | 'generic' (default: 'both')
  filter?: {
    tags?: string[];      // Filter by operation tags
    methods?: string[];   // Filter by HTTP methods ['GET', 'POST', etc.]
    paths?: string[];     // Filter by path patterns (supports wildcards)
  }
}
```

**Response:**

```typescript
{
  operationsCount: number;
  apiTitle: string;
  apiVersion: string;
  openai?: OpenAITool[];      // If format includes 'openai'
  anthropic?: AnthropicTool[]; // If format includes 'anthropic'
  generic?: GenericTool[];     // If format is 'generic'
}
```

**Example:**

```bash
curl -X POST http://localhost:3002/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "spec": {
      "openapi": "3.1.0",
      "info": {"title": "My API", "version": "1.0.0"},
      "paths": {
        "/users": {
          "get": {
            "operationId": "listUsers",
            "summary": "List all users",
            "parameters": [{
              "name": "limit",
              "in": "query",
              "schema": {"type": "integer", "minimum": 1, "maximum": 100}
            }],
            "responses": {"200": {"description": "Success"}}
          }
        }
      }
    },
    "format": "openai"
  }'
```

**Response:**

```json
{
  "operationsCount": 1,
  "apiTitle": "My API",
  "apiVersion": "1.0.0",
  "openai": [
    {
      "type": "function",
      "function": {
        "name": "listUsers",
        "description": "GET /users\n\nList all users",
        "parameters": {
          "type": "object",
          "properties": {
            "limit": {
              "type": "integer",
              "description": "Range: 1-100"
            }
          }
        }
      }
    }
  ]
}
```

### POST /convert/validate

Validate an OpenAPI specification without converting.

**Request Body:**

```typescript
{
  spec: object; // OpenAPI 3.x specification
}
```

**Response:**

```typescript
{
  valid: boolean;
  issues: Array<{
    severity: 'error' | 'warning';
    message: string;
    path?: string;
  }>;
  operationsCount: number;
  operations: Array<{
    name: string;
    method: string;
    path: string;
    description: string;
  }>;
}
```

**Example:**

```bash
curl -X POST http://localhost:3002/api/convert/validate \
  -H "Content-Type: application/json" \
  -d '{
    "spec": {
      "openapi": "3.1.0",
      "info": {"title": "Test API"},
      "paths": {}
    }
  }'
```

**Response:**

```json
{
  "valid": false,
  "issues": [
    {
      "severity": "warning",
      "message": "Missing API version",
      "path": "info.version"
    },
    {
      "severity": "error",
      "message": "No paths defined",
      "path": "paths"
    }
  ],
  "operationsCount": 0,
  "operations": []
}
```

### GET /convert/info

Get information about the converter capabilities.

**Response:**

```typescript
{
  name: string;
  version: string;
  supportedFormats: string[];
  supportedOpenAPIVersions: string[];
  features: string[];
  filters: {
    tags: string;
    methods: string;
    paths: string;
  };
}
```

**Example:**

```bash
curl http://localhost:3002/api/convert/info
```

## Filtering Operations

### By Tags

Only convert operations with specific tags:

```json
{
  "spec": {...},
  "filter": {
    "tags": ["users", "admin"]
  }
}
```

### By Methods

Only convert specific HTTP methods:

```json
{
  "spec": {...},
  "filter": {
    "methods": ["GET", "POST"]
  }
}
```

### By Path Patterns

Filter paths using wildcards:

```json
{
  "spec": {...},
  "filter": {
    "paths": ["/api/v1/*", "/admin/*"]
  }
}
```

### Combined Filters

All filters can be combined:

```json
{
  "spec": {...},
  "filter": {
    "tags": ["public"],
    "methods": ["GET"],
    "paths": ["/api/*"]
  }
}
```

## Error Responses

All endpoints follow the platform's standardized error format:

```json
{
  "error": {
    "code": "INVALID_FORMAT",
    "message": "Invalid OpenAPI specification",
    "target": "spec.openapi",
    "details": [{
      "code": "UNSUPPORTED_VERSION",
      "message": "Only OpenAPI 3.x is supported",
      "suggestion": "Use OpenAPI 3.0 or 3.1 specification format",
      "target": "spec.openapi"
    }],
    "doc_url": "https://docs.example.com/errors/INVALID_FORMAT",
    "request_id": "req_..."
  }
}
```

## Rate Limiting

The converter API follows the same rate limiting as other platform endpoints. Agent traffic is tracked separately.

## Integration Examples

### Node.js

```typescript
import fetch from 'node-fetch';

async function convertSpec(spec: any, format = 'both') {
  const response = await fetch('http://localhost:3002/api/convert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-ID': 'my-converter-bot',
    },
    body: JSON.stringify({ spec, format }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return await response.json();
}

// Usage
const tools = await convertSpec(myOpenAPISpec, 'openai');
console.log(`Generated ${tools.operationsCount} tools`);
```

### Python

```python
import requests

def convert_spec(spec, format='both'):
    response = requests.post(
        'http://localhost:3002/api/convert',
        json={'spec': spec, 'format': format},
        headers={'X-Agent-ID': 'my-converter-bot'}
    )
    response.raise_for_status()
    return response.json()

# Usage
tools = convert_spec(my_openapi_spec, 'anthropic')
print(f"Generated {tools['operationsCount']} tools")
```

### cURL

```bash
# Convert to both formats
curl -X POST http://localhost:3002/api/convert \
  -H "Content-Type: application/json" \
  -d @my-spec.json

# Validate only
curl -X POST http://localhost:3002/api/convert/validate \
  -H "Content-Type: application/json" \
  -d @my-spec.json

# Filter by tags
curl -X POST http://localhost:3002/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "spec": '$(cat my-spec.json)',
    "format": "openai",
    "filter": {"tags": ["public"]}
  }'
```

## Web UI

A web-based interface is available at:

```
http://localhost:3002/
```

The UI provides:
- Interactive spec editor
- Real-time validation
- Side-by-side format comparison
- Copy and download outputs
- Example specs

## Best Practices

1. **Validate First**: Use `/convert/validate` before converting to catch issues early

2. **Use Filters**: For large APIs, filter by tags or paths to reduce tool count

3. **Agent Headers**: Always include `X-Agent-ID` for proper tracking

4. **Error Handling**: Parse error suggestions to fix spec issues

5. **Cache Results**: Conversion is deterministic - cache results for the same spec

6. **Batch Processing**: For multiple specs, make parallel requests

7. **Version Pinning**: Lock to specific OpenAPI versions in production
