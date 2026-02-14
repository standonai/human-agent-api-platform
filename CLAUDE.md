# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

API platform designed as a first-class experience for both human developers and AI agents.  Core philosophy: simplicity, zero-config defaults, actionable errors, agent-first docs.

## Design Principles

Before implementing any feature, ask these questions:

1. **"How can I make this simpler?"** — Every line of code is a liability.
2. **"What's the one thing this absolutely must do perfectly?"** — Perfect execution of the essential beats good execution of everything.
3. **"Where am I adding complexity users don't value?"** — Features are not benefits.
4. **"What would this be like if it just worked magically?"** — Zero configuration should be the default.
5. **"How would I make this insanely great instead of just good?"** — Focus creates quality; breadth creates mediocrity.

These principles prioritize: **Simplicity** over flexibility · **Clarity** over comprehensiveness · **Defaults** over configuration · **User value** over technical sophistication.

## Key Files

| File | Purpose |
|------|---------|
| `src/server.ts` | Main server; middleware stack order documented here |
| `src/db/database.ts` | SQLite singleton (Drizzle ORM); schema for users/agents/tasks |
| `src/db/task-store.ts` | DB-backed task CRUD (synchronous, better-sqlite3) |
| `src/auth/user-store.ts` | User CRUD + password hashing |
| `src/auth/agent-store.ts` | Agent CRUD + API key management |
| `src/auth/jwt-utils.ts` | JWT access/refresh token generation + verification |
| `src/middleware/ownership.ts` | Simple ownership check: `requireOwnerOrAdmin(type, loader)` |
| `src/middleware/authorization.ts` | RBAC: `requireRole`, `requireAdmin`, `requireAdminOrDeveloper` |
| `src/observability/audit-logger.ts` | Audit logging + alert delivery (Slack/PagerDuty/webhook) |
| `src/observability/metrics-store.ts` | In-memory metrics + `trackAgentCall()` for zero-shot rate |
| `src/monitoring/prometheus-exporter.ts` | Prometheus gauges/counters including `agent_zero_shot_success_rate` |
| `specs/openapi/platform-api.yaml` | Full OpenAPI 3.1 spec (30+ endpoints) |
| `specs/asyncapi/platform-events.yaml` | AsyncAPI 3.0 event spec (17 channels, Redis+HTTP bindings) |
| `.spectral.yaml` | 18 custom Spectral rules; every error response MUST have `suggestion` field |

## Architecture

- **Storage**: SQLite via Drizzle ORM (`better-sqlite3`, synchronous driver). Default: `./data/platform.db`; override with `DATABASE_URL`. Metrics remain in-memory (intentional — use Prometheus for long-term retention).
- **Rate limiting**: Redis sliding window (100 human / 500 agent req/min), in-memory fallback.
- **Auth**: JWT (1h access, 7d refresh) + agent API keys (SHA-256 hashed).
- **Secrets**: Multi-provider (Vault/AWS/Azure/env), auto-rotation.
- **TLS**: Handled by the reverse proxy (nginx/caddy), not in-app.
- **Authorization**: Simple ownership check in `src/middleware/ownership.ts` replaces OWASP policy engine.

## Middleware Stack (Execution Order in server.ts)

1. Security headers (CSP, HSTS, X-Frame-Options)
2. CORS
3. JSON parser (10 MB limit)
4. Request ID
5. Prometheus metrics collection
6. Audit logging
7. Input sanitization (XSS)
8. Injection detection (SQL/NoSQL/command)
9. API versioning (header-based: `API-Version: YYYY-MM-DD`)
10. Agent tracking (sets `req.agentContext`; detects retries for zero-shot metric)
11. Legacy metrics middleware
12. Rate limiting (distributed)
13. Dry-run mode

## Error Response Envelope

Every error response **must** follow this shape (enforced by Spectral):

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Human-readable description",
    "target": "field_name",
    "details": [{
      "code": "VALUE_OUT_OF_RANGE",
      "message": "limit must be between 1 and 100",
      "suggestion": "Set limit to 100 or use pagination"
    }],
    "doc_url": "https://docs.example.com/errors/INVALID_PARAMETER",
    "request_id": "req_abc123"
  }
}
```

`suggestion` is mandatory — it enables agents to self-correct without human help.

## Test Commands

```bash
npm run test          # Vitest unit + integration tests
npm run lint:api      # Spectral OpenAPI linting (0 errors = healthy)
npm run type-check    # TypeScript check (0 errors required)
npm run dev           # Dev server (tsx watch, port 3000)
npm run db:studio     # Drizzle Studio for interactive DB inspection
```

**Test coverage**: 100 tests passing across 13 test files. 5 pre-existing failures in `rate-limiter.test.ts` (4) and `converter-routes.test.ts` (1) are known issues unrelated to core functionality.

## Environment Variables

**Required:**
- `JWT_SECRET` — JWT signing secret (`openssl rand -base64 32`)

**Optional — Database:**
- `DATABASE_URL` — SQLite file path (default: `./data/platform.db`)

**Optional — Redis:**
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `DISABLE_REDIS`

**Optional — Secrets:**
- `SECRETS_PROVIDER` (vault/aws/azure/env)
- Provider-specific: `VAULT_ADDR`, `AWS_REGION`, `AZURE_KEY_VAULT_URL`

**Optional — Alert Delivery:**
- `SLACK_WEBHOOK_URL` — Slack incoming webhook
- `PAGERDUTY_ROUTING_KEY` — PagerDuty Events API v2
- `ALERT_WEBHOOK_URL` — Generic webhook

## Quick Start

```bash
# Option A: Docker Compose (recommended)
cp .env.example .env          # Edit JWT_SECRET at minimum
docker compose up             # Starts app + Redis

# Option B: Manual
export JWT_SECRET=$(openssl rand -base64 32)
npm run dev
```

## Production Checklist

- [ ] Change default admin credentials (`admin@example.com` / `admin123`)
- [ ] Set strong `JWT_SECRET`
- [ ] Set `DATABASE_URL` to a durable path
- [ ] Configure TLS via reverse proxy (nginx/caddy)
- [ ] Set up Redis for distributed rate limiting
- [ ] Configure secrets provider (Vault/AWS/Azure)
- [ ] Configure alert delivery (`SLACK_WEBHOOK_URL` or `PAGERDUTY_ROUTING_KEY`)
- [ ] Enable audit log retention and rotation

## What Was Intentionally Not Built

- **Kubernetes manifests** — Use Docker Compose + your own k8s tooling
- **In-app TLS** — Use a reverse proxy instead
- **OWASP policy engine** — `requireOwnerOrAdmin()` covers the actual use case in ~80 LOC

## Agent Success Metric

`agent_zero_shot_success_rate` Prometheus gauge tracks whether agents succeed on their first API call. A retry is detected when the same `X-Agent-ID` hits the same endpoint within 60 seconds.

```bash
curl localhost:3000/api/monitoring/metrics | grep agent_zero_shot
```
