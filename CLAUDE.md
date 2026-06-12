# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

API platform designed as a first-class experience for both human developers and AI agents.  Core philosophy: simplicity, zero-config defaults, actionable errors, agent-first docs.

The phased plan for evolving this repo (toolkit extraction, MCP surface, delegation, human-in-the-loop) lives in `ROADMAP.md`. Any change that touches routes must update `specs/openapi/platform-api.yaml` and pass Spectral in the same change.

## Design Principles

Before implementing any feature, ask these questions:

1. **"How can I make this simpler?"** — Every line of code is a liability.
2. **"What's the one thing this absolutely must do perfectly?"** — Perfect execution of the essential beats good execution of everything.
3. **"Where am I adding complexity users don't value?"** — Features are not benefits.
4. **"What would this be like if it just worked magically?"** — Zero configuration should be the default.
5. **"How would I make this insanely great instead of just good?"** — Focus creates quality; breadth creates mediocrity.

These principles prioritize: **Simplicity** over flexibility · **Clarity** over comprehensiveness · **Defaults** over configuration · **User value** over technical sophistication.

## Repo Layout (npm workspaces, Phase 1)

```
packages/agent-errors/     # error envelope + ErrorBuilder + Express errorHandler + Spectral ruleset
packages/agent-dry-run/    # dryRunMiddleware + withDryRun
packages/agent-metrics/    # agent detection, metrics store, zero-shot tracking (onZeroShotRate)
apps/reference/            # the platform server, consuming the packages
```

Run npm scripts from the repo root — they delegate into workspaces. App
code imports the packages directly (`@standonai/agent-errors/errors`,
`@standonai/agent-metrics/metrics-store`, …); the Phase-1 re-export shims
were collapsed in Release A.

## Key Files

| File | Purpose |
|------|---------|
| `apps/reference/src/server.ts` | Main server; middleware stack order documented here |
| `apps/reference/src/db/database.ts` | SQLite singleton (Drizzle ORM); schema for users/agents/tasks |
| `apps/reference/src/db/task-store.ts` | DB-backed task CRUD (synchronous, better-sqlite3) |
| `apps/reference/src/auth/user-store.ts` | User CRUD + password hashing + bootstrap seeding |
| `apps/reference/src/auth/agent-store.ts` | Agent CRUD + API key management |
| `apps/reference/src/auth/delegation-store.ts` | Delegation grants CRUD + scope constants (`VALID_SCOPES`) |
| `apps/reference/src/api/oauth-routes.ts` | `/oauth/token`: client_credentials + RFC 8693 token exchange |
| `apps/reference/src/api/delegations-routes.ts` | Grant create/list/revoke (session tokens only) |
| `apps/reference/src/middleware/auth.ts` | Bearer auth for session/agent/delegated tokens; live grant check; `WWW-Authenticate` |
| `apps/reference/src/approvals/approval-store.ts` | Pending changes (HITL) + execution claiming |
| `apps/reference/src/api/approvals-routes.ts` | Approval list/status/approve/reject + SSE events |
| `apps/reference/src/middleware/approval-gate.ts` | `?require_approval=true` capture + APPROVAL_POLICY hook |
| `apps/reference/src/middleware/idempotency.ts` | Idempotency-Key replay (pre-auth, metric-safe) |
| `apps/reference/src/middleware/ownership.ts` | Simple ownership check: `requireOwnerOrAdmin(type, loader)` |
| `apps/reference/src/middleware/authorization.ts` | RBAC: `requireRole`, `requireAdmin`, `requireAdminOrDeveloper` |
| `apps/reference/src/observability/audit-logger.ts` | Audit logging + alert delivery (Slack/PagerDuty/webhook) |
| `packages/agent-metrics/src/metrics-store.ts` | In-memory metrics + `trackAgentCall()` + `onZeroShotRate()` |
| `apps/reference/src/monitoring/prometheus-exporter.ts` | Prometheus gauges incl. `agent_zero_shot_success_rate` (subscribes to agent-metrics) |
| `apps/reference/src/tools/mcp-converter.ts` | OpenAPI → MCP tool generator (annotations, dry_run mapping) |
| `apps/reference/src/mcp/` | MCP server at `/mcp` (streamable HTTP) + tool catalog + `/.well-known/mcp.json` + `/llms.txt` |
| `apps/reference/specs/openapi/platform-api.yaml` | Full OpenAPI 3.1 spec — also the source of truth for MCP tools |
| `apps/reference/specs/asyncapi/platform-events.yaml` | AsyncAPI 3.0 event spec — approval SSE channel (trimmed to implemented reality in Phase 4) |
| `packages/agent-errors/spectral.yaml` | 18 custom Spectral rules; every error response MUST have `suggestion` (app's `.spectral.yaml` extends it) |

## Architecture

- **Monorepo**: npm workspaces; three publishable packages (`@standonai/agent-errors`, `@standonai/agent-dry-run`, `@standonai/agent-metrics`) + the private reference app. Package `prepare` scripts build `dist/` on install; vitest aliases resolve packages to source.
- **Storage**: SQLite via Drizzle ORM (`better-sqlite3`, synchronous driver). Default: `./data/platform.db` relative to `apps/reference`; override with `DATABASE_URL`. Metrics remain in-memory (intentional — use Prometheus for long-term retention).
- **Rate limiting**: Redis sliding window (100 human / 500 agent req/min), in-memory fallback.
- **Auth**: JWT sessions (1h access, 7d refresh) + OAuth 2.1 token endpoint at `/oauth/token` — `client_credentials` (agent API keys, SHA-256 hashed) and RFC 8693 token exchange for **delegated tokens** (agent acting on behalf of a user). Delegated tokens are validated against the live `delegation_grants` row on every request (revocation is immediate); role never delegates (pinned to viewer). Direct `X-Agent-*` header auth on data routes was removed; the agent id/key pair authenticates only at `/oauth/token`.
- **Scopes**: `tasks:read` / `tasks:write` / `profile:read`, enforced for delegated tokens only (`src/middleware/scopes.ts`).
- **Secrets**: Environment-variable provider built in; external managers (Vault/AWS/Azure) by implementing the `SecretsProvider` interface in `src/secrets/secrets-manager.ts`.
- **TLS**: Handled by the reverse proxy (nginx/caddy), not in-app.
- **Authorization**: Simple ownership check in `src/middleware/ownership.ts` replaces OWASP policy engine.
- **MCP**: `/mcp` serves spec-generated tools over streamable HTTP (stateless). Tool calls dispatch as loopback HTTP through the full middleware stack — REST and MCP semantics are identical; auth headers are forwarded. Admin tags excluded by default (`MCP_TOOL_TAGS` overrides). `/mcp` is exempt from injection detection (dispatched calls are still checked).
- **Approvals (HITL)**: mutations accept `?require_approval=true` (MCP tools get a `require_approval` input) → captured as `pending_changes`, 202 + status/events URLs. Human approves/rejects from session (API or dashboard); approval re-dispatches under a single-use `approval_exec` token restoring the proposer's context. SSE at `/api/approvals/{id}/events`. `APPROVAL_POLICY=delegated-destructive` forces approval for delegated DELETEs.
- **Idempotency**: `Idempotency-Key` header on mutations replays stored responses (scoped to exact credentials+method+path+key); replays short-circuit before auth so they never pollute the zero-shot metric.

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
14. Idempotency-Key replay (pre-route-auth so replays never re-execute or skew metrics)

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

**Test coverage**: 133 tests passing across 19 test files, 0 failures.

## Environment Variables

**Required:**
- `JWT_SECRET` — JWT signing secret (`openssl rand -base64 32`)

**Optional — Database:**
- `DATABASE_URL` — SQLite file path (default: `./data/platform.db`)

**Optional — Redis:**
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `DISABLE_REDIS`

**Optional — Secrets:**
- `SECRETS_PROVIDER` (only `env` is built in; any other value fails startup with a pointer to the `SecretsProvider` interface)

**Optional — Delegation:**
- `DELEGATION_DEFAULT_TTL_SECONDS` (86400), `DELEGATION_MAX_TTL_SECONDS` (604800), `DELEGATED_TOKEN_TTL_SECONDS` (900)

**Optional — Approvals:**
- `APPROVAL_TTL_SECONDS` (86400), `APPROVAL_POLICY` (`none` | `delegated-destructive`)

**Optional — MCP:**
- `MCP_TOOL_TAGS` — comma-separated spec tags to expose as MCP tools (default: all except audit/secrets/monitoring/agents/mcp)
- `MCP_API_BASE_URL` — base URL the MCP dispatcher calls back into (default: this server)
- `OPENAPI_SPEC_PATH` — spec file the tool catalog is generated from

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

- [ ] Provision the admin user (bootstrap seeding requires `ENABLE_BOOTSTRAP_SEEDING=true`, is blocked in production, and generates a one-time password unless `BOOTSTRAP_ADMIN_PASSWORD` is set)
- [ ] Set strong `JWT_SECRET`
- [ ] Set `DATABASE_URL` to a durable path
- [ ] Configure TLS via reverse proxy (nginx/caddy)
- [ ] Set up Redis for distributed rate limiting
- [ ] Implement a custom `SecretsProvider` if you need an external secrets manager
- [ ] Configure alert delivery (`SLACK_WEBHOOK_URL` or `PAGERDUTY_ROUTING_KEY`)
- [ ] Enable audit log retention and rotation

## What Was Intentionally Not Built

- **Kubernetes manifests** — Use Docker Compose + your own k8s tooling
- **In-app TLS** — Use a reverse proxy instead
- **OWASP policy engine** — `requireOwnerOrAdmin()` covers the actual use case in ~80 LOC
- **API gateway sync (Kong/Apigee/AWS/Azure)** — Deleted in Phase 0 (~2k LOC); use your gateway's own spec-import tooling
- **Cloud secrets providers** — Only the env provider ships; implement `SecretsProvider` for Vault/AWS/Azure
- **OpenAI/Anthropic tool-format converters + `/api/convert`** — Removed in Release A; the MCP surface is the one tool story
- **Demo users routes + validation module** — Removed in Release A; the task domain is the demo

## Agent Success Metric

`agent_zero_shot_success_rate` Prometheus gauge tracks whether agents succeed on their first API call. A retry is detected when the same `X-Agent-ID` hits the same endpoint within 60 seconds.

```bash
curl localhost:3000/api/monitoring/metrics | grep agent_zero_shot
```
