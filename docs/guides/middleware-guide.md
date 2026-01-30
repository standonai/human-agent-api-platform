# Middleware Guide

This guide explains the middleware components that implement the core platform standards.

## Overview

The platform provides five core middleware components that should be applied to all APIs:

1. **Request ID** - Unique request tracking
2. **Versioning** - Header-based API versioning with deprecation support
3. **Agent Tracking** - AI agent identification and observability
4. **Dry-Run** - Validation without execution
5. **Error Handler** - Standardized error responses

## Request ID Middleware

Generates unique request IDs for tracing and error correlation.

### Usage

```typescript
import { requestIdMiddleware } from 'human-agent-api-platform';

app.use(requestIdMiddleware);
```

### Features

- Generates unique IDs with format: `req_<timestamp>_<random>`
- Respects existing `X-Request-ID` header if present
- Adds `X-Request-ID` to response headers
- Attaches `requestId` to request object

### Example

```typescript
app.get('/api/users', (req, res) => {
  console.log('Request ID:', req.requestId);
  // req_1abc2def3_1234567890abcdef
});
```

## Versioning Middleware

Implements header-based versioning with deprecation warnings.

### Usage

```typescript
import { versioningMiddleware, VersionConfig } from 'human-agent-api-platform';

const config: VersionConfig = {
  defaultVersion: '2025-01-29',
  supportedVersions: [
    { version: '2025-01-29' },
    { version: '2024-12-01', deprecated: true },
  ],
  deprecatedVersions: new Map([
    ['2024-12-01', {
      deprecationDate: new Date('2024-12-01'),
      sunsetDate: new Date('2025-06-01'),
      migrationGuide: 'https://docs.example.com/migration/2025-01-29',
      replacementVersion: '2025-01-29',
    }],
  ]),
};

app.use(versioningMiddleware(config));
```

### Features

- Date-based versioning (YYYY-MM-DD format)
- Automatic deprecation headers: `Deprecation`, `Sunset`, `Warning`
- Migration guide links via `Link` header
- Falls back to default version if invalid

### Request/Response

```bash
# Request
curl -H "API-Version: 2024-12-01" http://localhost:3000/api/users

# Response Headers
API-Version: 2024-12-01
Deprecation: Sat, 01 Dec 2024 00:00:00 GMT
Sunset: Sun, 01 Jun 2025 00:00:00 GMT
Warning: 299 - "API version 2024-12-01 is deprecated..."
```

## Agent Tracking Middleware

Identifies and tracks AI agent requests for observability.

### Usage

```typescript
import { agentTrackingMiddleware, isAgentRequest } from 'human-agent-api-platform';

app.use(agentTrackingMiddleware);

app.get('/api/data', (req, res) => {
  if (isAgentRequest(req)) {
    // Handle agent-specific logic
  }
});
```

### Features

- Detects agent type from User-Agent header
- Supports explicit agent ID via `X-Agent-ID` header
- Identifies: `openai`, `anthropic`, `custom`, `human`
- Adds `X-Detected-Agent-Type` header to responses

### Agent Detection

```typescript
// OpenAI agents
User-Agent: OpenAI-GPT/4.0 → agentType: 'openai'

// Anthropic agents
User-Agent: Claude-Agent/1.0 → agentType: 'anthropic'

// Human browsers
User-Agent: Mozilla/5.0... → agentType: 'human'
```

### Agent Context

```typescript
app.get('/api/info', (req, res) => {
  const { identification, requestId, timestamp } = req.agentContext;

  res.json({
    agentType: identification.agentType,
    agentId: identification.agentId,
    userAgent: identification.userAgent,
  });
});
```

## Dry-Run Middleware

Enables validation without execution for mutating operations.

### Usage

```typescript
import { dryRunMiddleware, isDryRun } from 'human-agent-api-platform';

app.use(dryRunMiddleware);

app.post('/api/users', (req, res) => {
  // Validate request
  validateRequest(req.body);

  if (isDryRun(req)) {
    return res.json({
      dry_run: true,
      validation: 'passed',
      message: 'User would be created successfully',
    });
  }

  // Execute actual operation
  const user = createUser(req.body);
  res.json(user);
});
```

### Features

- Activated via `?dry_run=true` or `?dry_run=1` query parameter
- Adds `X-Dry-Run: true` header to responses
- Enables agents to validate requests before committing

### Example Request

```bash
# Dry-run mode
curl -X POST "http://localhost:3000/api/users?dry_run=true" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'

# Response
{
  "dry_run": true,
  "validation": "passed",
  "message": "User would be created successfully"
}
```

## Error Handler Middleware

Converts all errors to standardized error responses.

### Usage

```typescript
import { errorHandler, ApiError, ErrorCode } from 'human-agent-api-platform';

// Apply other middleware first
app.use(requestIdMiddleware);
// ... other middleware

// Define routes
app.post('/api/users', (req, res) => {
  if (!req.body.name) {
    throw new ApiError(
      400,
      ErrorCode.MISSING_REQUIRED_FIELD,
      'The name field is required',
      'name',
      [{
        code: 'MISSING_FIELD',
        message: 'name is required',
        suggestion: 'Add a name field to the request body',
        target: 'name',
      }]
    );
  }
});

// Error handler must be LAST
app.use(errorHandler({
  docBaseUrl: 'https://docs.example.com',
  includeStackTrace: process.env.NODE_ENV !== 'production',
}));
```

### Features

- Standardized error envelope format
- Automatic error code documentation links
- Actionable suggestions in error details
- Stack traces in development mode
- Rate limit headers for 429 errors

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "The limit parameter is out of range",
    "target": "limit",
    "details": [{
      "code": "VALUE_OUT_OF_RANGE",
      "message": "limit must be between 1 and 100",
      "suggestion": "Set limit to a value between 1 and 100",
      "target": "limit"
    }],
    "doc_url": "https://docs.example.com/errors/INVALID_PARAMETER",
    "request_id": "req_1abc2def3_1234567890abcdef"
  }
}
```

### Async Handler

For async route handlers, use the `asyncHandler` wrapper to catch promise rejections:

```typescript
import { asyncHandler } from 'human-agent-api-platform';

app.get('/api/users', asyncHandler(async (req, res) => {
  const users = await fetchUsersFromDB();
  res.json(users);
}));
```

## Complete Example

```typescript
import express from 'express';
import {
  requestIdMiddleware,
  versioningMiddleware,
  agentTrackingMiddleware,
  dryRunMiddleware,
  errorHandler,
  asyncHandler,
  ApiError,
  ErrorCode,
} from 'human-agent-api-platform';

const app = express();

// Parse JSON
app.use(express.json());

// Core middleware (order matters!)
app.use(requestIdMiddleware);
app.use(versioningMiddleware(versionConfig));
app.use(agentTrackingMiddleware);
app.use(dryRunMiddleware);

// Routes
app.get('/api/users', asyncHandler(async (req, res) => {
  const users = await getUsers();
  res.json({ data: users });
}));

// Error handler LAST
app.use(errorHandler({
  docBaseUrl: 'https://docs.example.com',
  includeStackTrace: process.env.NODE_ENV !== 'production',
}));

app.listen(3000);
```

## Best Practices

1. **Middleware Order**: Apply middleware in this order:
   - Request ID (first)
   - Versioning
   - Agent Tracking
   - Dry-Run
   - Your routes
   - Error Handler (last)

2. **Error Handling**: Always include actionable suggestions in error details

3. **Versioning**: Use date-based versions (YYYY-MM-DD) for clarity

4. **Agent Support**: Design endpoints to work for both humans and agents

5. **Dry-Run**: Support dry-run mode on all mutating operations (POST, PUT, DELETE)

6. **Testing**: Test with various agent User-Agents and deprecated versions
