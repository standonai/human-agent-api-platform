# Human-Agent API Platform

> **A production-ready API platform designed for both human developers and AI agents**, featuring OpenAPI-first design, multi-cloud gateway integration, and built-in observability.

![Build](https://img.shields.io/badge/CI-configured-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## 🎯 What Is This?

This platform demonstrates how to build **APIs that work seamlessly for both humans and AI agents**:

- ✅ **Self-documenting** via OpenAPI 3.1 specifications
- ✅ **Agent-friendly** with structured errors and actionable suggestions
- ✅ **Multi-cloud ready** - Deploy to AWS, Azure, Apigee, or Kong
- ✅ **Observable** with real-time metrics and dashboards
- ✅ **Zero-shot success >80%** - AI agents succeed on first API call

## 🔄 How It Works

This is an **API server template** - think of it like a starting point for building your own API platform. Here's how the pieces fit together:

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR API PLATFORM (This Project)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Express Server (Port 3000)                         │   │
│  │                                                      │   │
│  │  Built-in Features:                                 │   │
│  │  • Rate limiting (agent-aware)                      │   │
│  │  • OpenAPI 3.1 specs (auto-generated)              │   │
│  │  • Observability dashboard                          │   │
│  │  • Gateway integration (Kong/AWS/Azure/Apigee)     │   │
│  │  • Error handling with suggestions                  │   │
│  │                                                      │   │
│  │  YOUR Business Logic:                               │   │
│  │  • Add your own endpoints (payments, orders, etc.) │   │
│  │  • Inherits all the agent-friendly features        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP API Calls
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  Human   │    │    AI    │    │  Other   │
    │  Devs    │    │  Agents  │    │  Systems │
    └──────────┘    └──────────┘    └──────────┘
    Web/Mobile      GPT-4/Claude    Webhooks
    Apps            Autonomous       Integrations
```

### Three Ways to Use This Platform

#### Option 1: Use as a Reference/Example
```bash
# Study the code to learn best practices
git clone https://github.com/standonai/human-agent-api-platform.git
cd human-agent-api-platform
# Read the code, copy patterns into your own API
```

**What you learn:**
- How to structure agent-friendly errors
- How to implement rate limiting
- How to set up OpenAPI specs
- How to build observability dashboards

#### Option 2: Fork and Customize (Recommended)
```bash
# Fork this repo and add your business logic
git clone https://github.com/standonai/human-agent-api-platform.git
cd human-agent-api-platform

# Add your own endpoints
# Example: src/api/payments-routes.ts
# Example: src/api/orders-routes.ts

npm run dev
```

**What you get:**
- ✅ All the agent-friendly features (rate limiting, observability, etc.)
- ✅ Your custom business logic
- ✅ Proven patterns and best practices

#### Option 3: Use as-is for Testing
```bash
# Run the example API to test AI agents
npm ci && npm run dev

# Use /api/auth and /api/v2/tasks to test your agent
# See how agents interact with well-designed APIs
```

### User Interaction Flow

**Example: E-commerce API built on this platform**

```
1. YOU (Platform Engineer):
   ├─ Clone this repo
   ├─ Add business endpoints (products, orders, checkout)
   ├─ Deploy to production
   └─ Monitor via dashboard

2. DEVELOPER (Using Your API):
   ├─ Reads your OpenAPI spec
   ├─ Builds a mobile app
   ├─ Calls: POST /api/orders
   └─ Gets clear errors with suggestions

3. AI AGENT (Autonomous):
   ├─ Fetches tool definitions: GET /api/tools/openai
   ├─ User asks: "Order 3 red t-shirts size M"
   ├─ Agent calls: POST /api/orders
   ├─ Agent handles errors (reads suggestions)
   └─ Confirms order to user

4. END USER:
   └─ Never sees your API directly
       (Uses the mobile app or talks to the AI agent)
```

### What You Need to Build

**This platform provides** (out of the box):
- ✅ Rate limiting middleware
- ✅ Agent tracking and observability
- ✅ OpenAPI spec generation
- ✅ Gateway integration
- ✅ Error handling framework
- ✅ Versioning support
- ✅ Example endpoints (`/api/users`)

**You add** (your business logic):
- Your domain models (products, orders, customers, etc.)
- Your database integration (PostgreSQL, MongoDB, etc.)
- Your authentication (JWT, OAuth, API keys)
- Your business rules and validation
- Your external integrations (payment gateways, email, etc.)

### Real-World Example

**Building a Task Management API:**

```typescript
// You keep all the platform features
import { rateLimit, agentTracking, errorBuilder } from './middleware';

// You add your business logic
import { taskRoutes } from './api/tasks-routes';     // YOUR CODE
import { projectRoutes } from './api/projects-routes'; // YOUR CODE

const app = express();

// Platform features (provided)
app.use(agentTracking);
app.use(rateLimit());

// Your business endpoints
app.use('/api/tasks', taskRoutes);       // YOUR ENDPOINTS
app.use('/api/projects', projectRoutes); // YOUR ENDPOINTS

// Agents can now autonomously:
// - Create tasks: POST /api/tasks
// - List projects: GET /api/projects
// - With all the agent-friendly features!
```

**Your OpenAPI spec automatically includes:**
- Rate limit documentation
- Structured error responses
- Tool definitions for agents
- Dry-run support
- Request/response examples

## 📝 Adding Your Own Endpoints

This platform is a **template** - you add your business logic. Here's a complete walkthrough:

### Step 1: Create Your Route File

Create a new file in `src/api/`:

```typescript
// src/api/tasks-routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { ApiError, ErrorCode } from '../types/errors.js';

const router = Router();

// Your data model (replace with database in production)
interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  createdAt: string;
}

const tasks = new Map<string, Task>();
let taskCounter = 1;

/**
 * POST /api/v2/tasks
 * Create a new task
 */
router.post('/', (req: Request, res: Response) => {
  const { title, status } = req.body;

  // Validation with agent-friendly error
  if (!title) {
    const error: ApiError = {
      code: ErrorCode.INVALID_PARAMETER,
      message: 'Title is required',
      target: 'title',
      details: [{
        code: 'VALIDATION_ERROR',
        message: 'Title must be provided',
        suggestion: 'Provide a title between 1-200 characters',
      }],
      request_id: req.requestId || 'unknown',
    };
    res.status(400).json({ error });
    return;
  }

  // Support dry-run mode (agents can validate without side effects)
  if (req.query.dry_run === 'true') {
    res.status(200).json({
      data: {
        dry_run: true,
        message: 'Validation successful. Task would be created.',
      },
    });
    return;
  }

  // Create task
  const task: Task = {
    id: `task_${taskCounter++}`,
    title,
    status: status || 'todo',
    createdAt: new Date().toISOString(),
  };

  tasks.set(task.id, task);

  // Return success
  res.status(201).json({ data: task });
});

/**
 * GET /api/v2/tasks
 * List all tasks
 */
router.get('/', (req: Request, res: Response) => {
  const allTasks = Array.from(tasks.values());

  res.status(200).json({
    data: allTasks,
    meta: { total: allTasks.length },
  });
});

export default router;
```

### Step 2: Register the Route

Add your route to `src/server.ts`:

```typescript
// At the top with other imports
import tasksRoutes from './api/tasks-routes.js';

// In the route registration section
app.use('/api/v2/tasks', tasksRoutes);
```

### Step 3: Test Your Endpoint

```bash
# Build
npm run build

# Start server
npm run dev

# Test your new endpoint
curl -X POST http://localhost:3000/api/v2/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Build amazing API"}'

# Response:
# {
#   "data": {
#     "id": "task_1",
#     "title": "Build amazing API",
#     "status": "todo",
#     "createdAt": "2025-01-30T12:00:00Z"
#   }
# }
```

### Step 4: What You Get Automatically

Your new endpoint inherits **all platform features**:

✅ **Rate Limiting**
```bash
# Headers added automatically
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 499
```

✅ **Agent Tracking**
```bash
# Agent traffic tracked in dashboard
curl -H "X-Agent-ID: my-bot" http://localhost:3000/api/v2/tasks
```

✅ **Observability**
- View your endpoint in the dashboard at `/dashboard.html`
- See request counts, response times, error rates
- Track agent vs. human usage

✅ **Versioning**
```bash
# Version header support
curl -H "API-Version: 2025-01-29" http://localhost:3000/api/v2/tasks
```

✅ **Error Handling**
```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Title is required",
    "details": [{
      "suggestion": "Provide a title between 1-200 characters"
    }],
    "request_id": "req_abc123"
  }
}
```

✅ **Dry-Run Mode**
```bash
# Test without side effects
curl -X POST "http://localhost:3000/api/v2/tasks?dry_run=true" \
  -d '{"title": "Test"}'

# Response:
# { "data": { "dry_run": true, "message": "Validation successful" } }
```

### Step 5: Make It Agent-Friendly

AI agents will automatically discover and use your endpoint:

```bash
# Agents fetch tool definitions
curl http://localhost:3000/api/tools/openai

# Your endpoint is now available as a tool!
{
  "name": "create_task",
  "description": "Create a new task",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Task title" },
      "status": { "type": "string", "enum": ["todo", "in_progress", "done"] }
    }
  }
}
```

**Agents can now:**
- ✅ Create tasks autonomously
- ✅ Read error suggestions and self-correct
- ✅ Use dry-run mode to validate requests
- ✅ Track their own usage in the dashboard

### Complete Example: Payment API

Here's a more complex example with database integration:

```typescript
// src/api/payments-routes.ts
import { Router } from 'express';
import { ApiError, ErrorCode } from '../types/errors.js';
import { db } from '../database.js'; // Your database

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { amount, currency, customer_id } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      const error: ApiError = {
        code: ErrorCode.INVALID_PARAMETER,
        message: 'Amount must be positive',
        target: 'amount',
        details: [{
          code: 'VALIDATION_ERROR',
          message: 'Invalid amount',
          suggestion: 'Provide amount in cents (e.g., 1000 for $10.00)',
        }],
        request_id: req.requestId || 'unknown',
      };
      res.status(400).json({ error });
      return;
    }

    // Dry-run support
    if (req.query.dry_run === 'true') {
      res.json({ data: { dry_run: true, message: 'Payment would process' } });
      return;
    }

    // Process payment (your business logic)
    const payment = await db.payments.create({
      amount,
      currency,
      customer_id,
      status: 'pending',
    });

    // Call payment processor
    const result = await stripe.charges.create({
      amount,
      currency,
      customer: customer_id,
    });

    // Update payment
    await db.payments.update(payment.id, { status: 'completed' });

    res.status(201).json({ data: payment });
  } catch (err) {
    next(err);
  }
});

export default router;
```

### Key Patterns

**1. Always include error suggestions:**
```typescript
{
  suggestion: 'Use format: user@example.com'  // Agents read this!
}
```

**2. Support dry-run mode:**
```typescript
if (req.query.dry_run === 'true') {
  return res.json({ data: { dry_run: true, message: '...' } });
}
```

**3. Use standard error codes:**
```typescript
import { ErrorCode } from '../types/errors.js';
// INVALID_PARAMETER, RESOURCE_NOT_FOUND, CONFLICT, etc.
```

**4. Return consistent responses:**
```typescript
// Success:
res.status(200).json({ data: { ... } });

// Error:
res.status(400).json({ error: { ... } });
```

### What to Build

**Replace the example endpoints** (`/api/users`) with YOUR domain:

- **E-commerce:** `/api/products`, `/api/orders`, `/api/checkout`
- **CRM:** `/api/customers`, `/api/deals`, `/api/pipeline`
- **Project Management:** `/api/projects`, `/api/tasks`, `/api/sprints`
- **Finance:** `/api/payments`, `/api/invoices`, `/api/refunds`
- **Social:** `/api/posts`, `/api/comments`, `/api/likes`

The platform handles the infrastructure - you focus on your business logic!

## 🚀 Install and Use (Current Platform)

### Prerequisites

- Node.js 20+
- npm
- Redis (optional, recommended for distributed rate limiting and lockout/session coordination)

### 1) Install

```bash
git clone https://github.com/standonai/human-agent-api-platform.git
cd human-agent-api-platform
npm ci
cp .env.example .env
```

### 2) Minimum Local Secure Configuration

Update `.env` with at least:

```bash
NODE_ENV=development
APP_PROFILE=core
PORT=3000

JWT_SECRET=replace-with-a-strong-random-secret
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
DATABASE_URL=./data/platform.db
```

### 3) Choose Runtime Profile

- `APP_PROFILE=core`: minimal API surface for local development and fast startup
- `APP_PROFILE=full`: enables monitoring, gateway, secrets, and full dependency checks

Use strict full startup checks when validating production-like behavior:

```bash
APP_PROFILE=full FULL_PROFILE_STRICT=true npm run dev
```

### 4) Run the Platform

```bash
# Development
npm run dev

# Production-like run
npm run build
npm start
```

### 5) Verify Health and Auth Flow

```bash
# Health
curl http://localhost:3000/api/health

# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","name":"Example User"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Refresh
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<paste-refresh-token>"}'
```

### 6) Pre-Deployment Validation Checks

```bash
npm run type-check
npm run test:targeted
npm run smoke:startup
npm run preflight:prod-env
```

### 7) Required Production Controls

Production deployments should explicitly enforce:

- `STRICT_STARTUP_VALIDATION=true`
- `ENFORCE_HTTPS=true`
- `TRUST_PROXY=true` (or network-specific value like `loopback`/hop count)
- strong, non-placeholder `JWT_SECRET`
- explicit production `ALLOWED_ORIGINS`
- non-default durable `DATABASE_URL`

See [Authentication System](./AUTHENTICATION.md), [Security Guidelines](./SECURITY.md), and [Deployment](#-deployment).
For private-repo merge/release operations, use [Publishing Checklist](./PUBLISHING_CHECKLIST.md).

### 🔐 Default Credentials (Development Only)

**⚠️ CHANGE IN PRODUCTION!**

Admin User:
- Email: `admin@example.com`
- Password: `admin123`

Test the authentication:
```bash
# Login as admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin123"}'

# Run full authentication test suite
./scripts/test-auth.sh
```

See [AUTHENTICATION.md](./AUTHENTICATION.md) for complete authentication documentation.

## 📖 Documentation

### Core Documentation
- **[Architecture & Design Principles](./CLAUDE.md)** - Design philosophy and implementation guidance
- **[Authentication System](./AUTHENTICATION.md)** - JWT tokens and refresh/session security
- **[Authorization System](./AUTHORIZATION.md)** - RBAC and ownership-based controls
- **[Security Guidelines](./SECURITY.md)** - HTTPS/TLS, sanitization, audit, and response policy
- **[OpenAPI Specification](./specs/openapi/platform-api.yaml)** - Complete API documentation
- **[Spectral Rules](./.spectral.yaml)** - API linting and governance rules

### Quick References
All features and usage examples are documented in this README:
- [Authentication](#-authentication--authorization) - JWT tokens and agent API keys
- [AI Agent Support](#-ai-agent-support) - Tool definitions and self-correction
- [Multi-Cloud Gateways](#-multi-cloud-gateway-integration) - Kong, AWS, Azure, Apigee
- [Observability](#-built-in-observability) - Real-time dashboard and metrics
- [Deployment](#-deployment) - Local, Docker, Kubernetes, multi-cloud
- [Real-World Examples](#-real-world-examples) - ChatGPT, GitHub Actions, Slack

## ✨ Key Features

### 🔐 Authentication & Authorization

**Two authentication methods** - for humans and AI agents:

#### JWT Authentication (Users)
```bash
# Register a new user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "John Doe"
  }'

# Login and get access token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "SecurePass123!"}'

# Use access token
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Token Features:**
- Access tokens expire after 1 hour
- Refresh tokens last 7 days
- Automatic token refresh support
- Secure password hashing with bcrypt

#### Agent API Keys (AI Agents)
```bash
# Register an agent (admin only)
curl -X POST http://localhost:3000/api/agents/register \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "production-bot", "rateLimitOverride": 2000}'

# Use agent API key
curl -X POST http://localhost:3000/api/tasks \
  -H "X-Agent-ID: agent_abc123" \
  -H "X-Agent-Key: agnt_cb1c21f1ea40fd9f..." \
  -d '{"title": "Process order"}'
```

**API Key Security:**
- Cryptographically secure key generation (SHA-256)
- Keys never stored in plain text
- Individual rate limits per agent
- Deactivation without deletion

#### Role-Based Access Control (RBAC)
```typescript
// Protect routes by role
router.post('/admin/config',
  requireAuth,
  requireRole(UserRole.ADMIN),
  handler
);
```

**Roles:**
- **admin** - Full access including user/agent management
- **developer** - Create and manage API resources
- **viewer** - Read-only access

**Input Sanitization:**
- XSS prevention (automatic HTML stripping)
- SQL injection detection and blocking
- NoSQL injection detection (MongoDB operators)
- Command injection prevention
- Path traversal protection
- Unicode normalization
- Automatic input validation

**Audit Logging & Monitoring:**
- Comprehensive request logging (all API calls)
- Security event tracking (attacks, failures)
- Authentication event logging
- Searchable audit trails
- Compliance-ready (GDPR, SOC2, HIPAA)
- Daily rotating logs with retention
- Admin dashboard for statistics

**HTTPS/TLS Encryption:**
- TLS 1.2+ with strong cipher suites
- Self-signed certificates for development
- Let's Encrypt & commercial CA support
- Automatic HTTP to HTTPS redirect
- Forward secrecy (ECDHE)
- Load balancer compatible

**Production Security:**
- Encrypted communication (TLS 1.2+)
- CORS protection with whitelist
- Security headers (HSTS, CSP, X-Frame-Options)
- Request size limits
- Error sanitization in production

**Complete documentation:** [AUTHENTICATION.md](./AUTHENTICATION.md) | [AUTHORIZATION.md](./AUTHORIZATION.md) | [SECURITY.md](./SECURITY.md)

### 🤖 AI Agent Support

**Pre-built tool definitions** for OpenAI and Claude:

```bash
# Generate OpenAI function definitions
curl http://localhost:3000/api/tools/openai

# Generate Anthropic (Claude) tool definitions
curl http://localhost:3000/api/tools/anthropic
```

**Agents can use the API autonomously:**

```python
# Agent makes API call
response = openai.chat.completions.create(
    model="gpt-4-turbo",
    messages=[{"role": "user", "content": "Create a user for alice@example.com"}],
    tools=tools  # ← Generated from platform
)

# Agent calls create_user function
# ✅ Success on first try (zero-shot)
```

**Self-correcting errors:**

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Invalid email format",
    "details": [{
      "suggestion": "Use format: user@example.com"  // ← Agent reads and corrects
    }]
  }
}
```

**Success metrics:**
- Zero-shot success rate: **>80%**
- Error self-resolution: **>60%**
- Agent tracking: **Separate metrics for each AI agent**

### 🌐 Multi-Cloud Gateway Integration

**Deploy to multiple providers simultaneously:**

```bash
# Sync OpenAPI spec to all gateways
GATEWAY_PROVIDERS=kong,aws,azure,apigee npm start
```

**Startup output:**
```
📡 Multi-Gateway Sync Results:

✅ KONG     - Services: 1, Routes: 8, Plugins: 3
✅ AWS      - Services: 1, Routes: 8
✅ AZURE    - Services: 1, Routes: 8, Plugins: 3
✅ APIGEE   - Services: 1, Routes: 8, Plugins: 3

Overall: ✅ All syncs successful
```

**Supported providers:**
- **Kong** - Open-source, Kubernetes-native
- **AWS API Gateway** - HTTP API (v2) and REST API (v1)
- **Azure API Management** - Enterprise features with developer portal
- **Apigee** - Google Cloud API management

**Use cases:**
- 🔄 Hybrid cloud (Kong on-premises + AWS in cloud)
- 🌍 Multi-region (AWS us-east-1 + Azure westus2)
- 🚚 Migration (Run Kong + Apigee during transition)
- 🔓 Zero vendor lock-in

### 📊 Built-in Observability

**Real-time dashboard** at `/dashboard.html`:

![Dashboard](https://via.placeholder.com/800x400?text=Real-time+Observability+Dashboard)

**Metrics tracked:**
- Request count and success rate
- Response time (P50, P95, P99)
- Error rate by endpoint
- **Agent vs. human traffic breakdown**
- Top AI agents by usage

**Agent-specific metrics:**
```json
{
  "agents": {
    "gpt4-user-manager": {
      "requests": 150,
      "errors": 12,
      "successRate": 0.92
    },
    "claude-assistant": {
      "requests": 89,
      "errors": 3,
      "successRate": 0.97
    }
  }
}
```

### 📝 OpenAPI 3.1 Specifications

**100% coverage** with agent-friendly descriptions:

```yaml
paths:
  /api/users:
    post:
      summary: Create a new user account
      description: Creates a user account with email, name, and role. Returns user ID for subsequent operations.
      parameters:
        - name: email
          description: User's email address (must be unique)
          schema:
            type: string
            format: email
            example: alice@example.com
        - name: role
          description: "User's role: admin (full access), developer (read/write), viewer (read-only)"
          schema:
            type: string
            enum: [admin, developer, viewer]
      responses:
        '201':
          description: User created successfully
        '400':
          description: Invalid parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: INVALID_PARAMETER
                  message: Invalid email format
                  suggestion: Use format user@example.com  # ← Agent reads this
```

**Benefits:**
- Clear parameter descriptions
- Enum values with explanations
- Example formats in schemas
- Structured error responses

### 🔒 API Governance

**Spectral linting enforced in CI:**

```yaml
# .spectral.yaml - 18 custom rules
rules:
  # Critical: All errors must include suggestions for agent self-correction
  error-detail-suggestion-required:
    given: $.paths..responses.4*.content..schema.properties.error.properties.details.items
    then:
      field: properties.suggestion
      function: truthy
```

**Prevents:**
- ❌ Missing error suggestions (agents can't self-correct)
- ❌ Unclear parameter descriptions (low zero-shot success)
- ❌ Breaking changes without migration guides
- ❌ Missing examples (agents need context)

**CI integration:**
```bash
# Linting blocks PR merge if violations found
npm run lint:api
# ✅ 0 errors, 4 acceptable warnings
```

### 🔄 Versioning Strategy

**Header-based versioning** (no URL changes):

```bash
# Old version
curl -H "API-Version: 2025-01-29" /api/users

# New version
curl -H "API-Version: 2025-06-15" /api/users
```

**Deprecation warnings:**
```
Deprecation: true
Sunset: Wed, 01 Jan 2026 00:00:00 GMT
Link: <https://docs.../migration-guide>; rel="deprecation"
```

**Benefits:**
- No breaking URL changes
- Gradual migration periods
- Machine-readable deprecation notices
- Automatic migration guide links

## 🏗️ Architecture

### Core Pillars

The platform is built around **6 core pillars** (see [CLAUDE.md](./CLAUDE.md)):

1. **Schema-First Design** - OpenAPI 3.1 for all endpoints
2. **Structured Errors** - Actionable suggestions for self-correction
3. **Versioning** - Header-based with deprecation warnings
4. **Agent Observability** - Track AI agent usage separately
5. **AI-Focused Docs** - Optimized for LLM context windows
6. **Governance** - Spectral linting enforced in CI

### Tech Stack

```
┌─────────────────────────────────────────┐
│   API Platform (Express + TypeScript)   │
└───────────────┬─────────────────────────┘
                │
    ┌───────────┼───────────┐
    │           │           │
    ▼           ▼           ▼
┌────────┐ ┌─────────┐ ┌──────────┐
│ OpenAPI│ │Observ-  │ │ Gateway  │
│  3.1   │ │ability  │ │Integration│
└────────┘ └─────────┘ └──────────┘
                │
        ┌───────┼───────┐
        │       │       │
        ▼       ▼       ▼
    ┌────┐ ┌─────┐ ┌──────┐
    │Kong│ │ AWS │ │Azure │
    └────┘ └─────┘ └──────┘
```

**Technologies:**
- **TypeScript** - Type safety and IDE support
- **Express** - Web framework
- **Zod** - Runtime schema validation
- **Spectral** - OpenAPI linting
- **Vitest** - Testing framework
- **Chart.js** - Dashboard visualizations

### Project Structure

```
├── src/
│   ├── api/              # API routes and handlers
│   ├── gateway/          # Multi-cloud gateway integration
│   │   ├── kong-gateway.ts
│   │   ├── aws-gateway.ts
│   │   ├── azure-gateway.ts
│   │   ├── apigee-gateway.ts
│   │   └── multi-gateway-manager.ts
│   ├── middleware/       # Express middleware
│   │   ├── versioning.ts
│   │   ├── agent-tracking.ts
│   │   ├── rate-limiter.ts
│   │   └── error-handler.ts
│   ├── observability/    # Metrics and monitoring
│   ├── tools/           # AI agent tool generation
│   └── validation/      # OpenAPI-to-Zod conversion
├── specs/
│   └── openapi/
│       └── platform-api.yaml  # Complete OpenAPI spec
├── public/
│   └── dashboard.html    # Observability dashboard
└── tests/               # Test suite
```

## 🎓 Real-World Examples

### Example 1: ChatGPT Plugin

```json
{
  "schema_version": "v1",
  "name_for_model": "user_manager",
  "description_for_model": "Create and manage user accounts",
  "api": {
    "type": "openapi",
    "url": "https://api.mycompany.com/openapi.json"
  }
}
```

**Conversation:**
```
User: "Create a user for bob@example.com"
ChatGPT: [calls create_user API]
ChatGPT: "Created user Bob with ID user_abc123"
```

### Example 2: GitHub Actions Agent

```yaml
# .github/workflows/provision-user.yml
on:
  organization:
    types: [member_added]

jobs:
  provision:
    steps:
      - name: Create API user
        run: |
          curl -X POST https://api.mycompany.com/api/users \
            -H "X-Agent-ID: github-provisioner" \
            -d '{"email": "${{ github.event.member.email }}"}'
```

### Example 3: Slack Bot

```python
@app.command("/create-user")
def create_user(command):
    response = requests.post(
        'https://api.mycompany.com/api/users',
        headers={'X-Agent-ID': 'slack-bot'},
        json={'email': command['text']}
    )

    if response.ok:
        respond(f"✅ Created user {response.json()['data']['id']}")
    else:
        error = response.json()['error']
        # Show suggestion from error
        respond(f"💡 {error['details'][0]['suggestion']}")
```

## 📈 Success Metrics

### Developer Experience
- **Time to First API Call**: < 30 minutes
- **API Documentation**: 100% OpenAPI coverage
- **Error Clarity**: Actionable suggestions included

### AI Agent Performance
- **Zero-Shot Success Rate**: >80%
- **Error Self-Resolution**: >60%
- **Tool Call Success**: >90%

### Infrastructure
- **Multi-Cloud**: Deploy to 4 gateway providers
- **Uptime**: 99.9%+ with gateway redundancy
- **Response Time**: P95 < 200ms
- **Test Coverage**: Comprehensive automated test suite

## 🚀 Deployment

For install/run guidance first, start at [Install and Use (Current Platform)](#-install-and-use-current-platform).

### Local Development

```bash
npm run dev
# Server on http://localhost:3000
# No gateway required
```

Local defaults are for development convenience only. They are not production-safe defaults.

### Production (Multi-Cloud)

**Configuration:**
```bash
# .env.production
NODE_ENV=production
PORT=3000
APP_PROFILE=full
STRICT_STARTUP_VALIDATION=true
FULL_PROFILE_STRICT=true
ENFORCE_HTTPS=true
TRUST_PROXY=true

# Multi-cloud gateway sync (comma-separated)
GATEWAY_PROVIDERS=kong,aws,azure,apigee
GATEWAY_AUTO_SYNC=true

# Kong (optional)
GATEWAY_KONG_ADMIN_URL=http://kong.local:8001
GATEWAY_KONG_API_KEY=your-key

# AWS (optional)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_API_TYPE=HTTP  # or REST

# Azure (optional)
AZURE_SUBSCRIPTION_ID=your-id
AZURE_RESOURCE_GROUP=your-rg
AZURE_APIM_SERVICE_NAME=your-apim
GATEWAY_AZURE_API_KEY=$(az account get-access-token --query accessToken -o tsv)

# Apigee (optional)
APIGEE_ORGANIZATION=your-org
APIGEE_ENVIRONMENT=prod
GATEWAY_APIGEE_API_KEY=your-token
```

**Deploy:**
```bash
npm run build
npm start

# OpenAPI spec automatically syncs to all configured gateways!
```

Run production readiness checks before deploying:

```bash
npm run type-check
npm run test:targeted
npm run smoke:startup
npm run preflight:prod-env
npm run security:audit
```

### Docker

```bash
docker build -t api-platform .
docker run -p 3000:3000 --env-file .env.production api-platform
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-platform
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: api-platform
        image: api-platform:latest
        env:
        - name: GATEWAY_PROVIDERS
          value: "aws,azure"
        envFrom:
        - secretRef:
            name: api-platform-secrets
```

### CLI Commands

```bash
# Sync to gateways
npm run gateway:sync

# Check gateway status
npm run gateway:status

# Health check
npm run gateway:health
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run targeted release checks
npm run test:targeted

# Lint OpenAPI specs
npm run lint:api

# Type check
npm run type-check

# Startup/production safety checks
npm run smoke:startup
npm run preflight:prod-env
```

## 📦 GitHub Publish Checklist

Before making this repository public:

1. Update clone URLs/placeholders to your actual GitHub org/repo.
2. Set branch protection rules and require CI checks:
   - `Minimal Gate / Typecheck + Targeted + Startup Smoke`
   - `CI / Extended CI (Lint, Full Test, Build)`
3. Configure repository secrets/variables for deployment environments.
4. Verify production env values:
   - strong `JWT_SECRET`
   - explicit `ALLOWED_ORIGINS`
   - durable `DATABASE_URL`
   - `ENFORCE_HTTPS=true` and valid `TRUST_PROXY`
5. Run release verification:
   - `npm run type-check`
   - `npm run test:targeted`
   - `npm run smoke:startup`
   - `npm run preflight:prod-env`

For current private-repo publishing flow on plans without branch protection/rulesets, see [Publishing Checklist](./PUBLISHING_CHECKLIST.md).

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **All APIs must have OpenAPI 3.1 specs**
2. **Errors must include actionable suggestions**
3. **Use header-based versioning**
4. **Pass Spectral linting** (0 errors)
5. **Include tests** for new features

```bash
# Before submitting PR
npm run lint:api    # Spectral linting
npm test            # All tests
npm run build       # TypeScript compilation
```

## 📚 Learn More

- **[Architecture & Design Principles](./CLAUDE.md)** - Core principles and implementation guidance
- **[Security Guidelines](./SECURITY.md)** - Security best practices and reporting
- **[OpenAPI Specification](./specs/openapi/platform-api.yaml)** - Complete API documentation
- **[Contributing Guidelines](#-contributing)** - How to contribute to this project

## 🏆 What Makes This Special?

### Traditional APIs:
- ❌ Documentation written for humans only
- ❌ Vague error messages
- ❌ No AI agent support
- ❌ Manual gateway configuration
- ❌ Limited observability

### This Platform:
- ✅ **Agent-first design** - LLMs can use autonomously
- ✅ **Structured errors** - Actionable suggestions for self-correction
- ✅ **Zero-shot success >80%** - Agents succeed on first try
- ✅ **Multi-cloud** - Auto-sync to Kong, AWS, Azure, Apigee
- ✅ **Built-in observability** - Real-time dashboard
- ✅ **Production-ready** - Strict TypeScript and automated quality gates

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [Express](https://expressjs.com/) - Web framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Zod](https://zod.dev/) - Schema validation
- [Spectral](https://stoplight.io/open-source/spectral) - OpenAPI linting
- [Chart.js](https://www.chartjs.org/) - Dashboard charts

---

**Ready to build APIs for both humans and AI agents?**

```bash
git clone https://github.com/standonai/human-agent-api-platform.git
cd human-agent-api-platform
npm ci && npm run dev
```

**Questions?** Open an issue in this repository.
