# Human-Agent API Platform

A TypeScript/Express API platform for human and agent clients, with OpenAPI specs, auth, security controls, and operational checks.

## What This Is (in one analogy)

**Agents like Claude, Codex, OpenClaw, or Hermes are the cars. This repo is the design for the roads, traffic lights, and driver's licenses.**

Agent products answer the question *"how do I get an AI to do work?"* This repo answers the opposite one: ***"how should my app safely receive an AI worker?"*** It is not an agent and does not compete with any agent — it is the **other end of the wire**: a working blueprint for any backend that AI agents will connect to.

Today, when you point an agent at your systems, it usually logs in **as you**, with **all** your power, **indefinitely** — and the service can't tell agent-you from human-you. This platform shows the alternative:

| Today's default | What this platform does instead |
|---|---|
| Agent acts as you, full power | Agent gets a **scoped, expiring grant**: "tasks only, 24 hours" |
| Revoke = change your password | Revoke = one click, takes effect on the agent's **next request** |
| Service can't tell agent from human | Every action logged as "Agent X **acting for** User Y" |
| Agent deletes something? Done. | Risky changes become **proposals a human approves first** |
| Errors say "Bad Request"; agent flails | Errors carry a **`suggestion`**; the agent self-corrects |
| Hand-written integration for each agent | The API **self-describes**: MCP tools generated from the spec, plus `llms.txt` |

The repo ships three things: **installable packages** (adopt the patterns in your own backend), a **reference platform** (a runnable example with a demo task domain), and an **eval harness** that measures — with a real agent — how much these patterns improve agent success versus an ordinary API.

## Using It With Your Agent

The reference platform speaks both native protocols agents use, so any of the agents below can drive it with **zero custom integration code**.

**MCP-native agents (Claude, Claude Code, Codex, and any MCP client):** point them at the MCP endpoint and every API operation appears as a ready-made tool — with safety annotations, a `dry_run` preview input, and a `require_approval` input on every mutation.

```bash
npm run dev   # start the platform, then e.g.:
claude mcp add --transport http platform http://localhost:3000/mcp
```

**REST-driven agents (OpenClaw, Hermes, custom frameworks):** they use the plain HTTP API. Have the agent fetch `http://localhost:3000/llms.txt` first — it's a plain-language explanation of the API written *for* the agent (auth flow, endpoints, error-recovery rules, retry semantics).

**The handshake that makes it safe (any agent):**

1. **Register the agent once** (`POST /api/agents/register`) → it gets its own ID + API key.
2. **The human grants authority** from the dashboard or `POST /api/delegations`: which scopes (e.g. `tasks:read tasks:write`), for how long.
3. **The agent trades credentials for a delegated token** at `POST /oauth/token` (OAuth 2.1 client credentials + RFC 8693 token exchange) — a short-lived token meaning *"Agent X, acting for User Y, allowed to do exactly this."*
4. **It acts** — over MCP or REST, same token — previewing risky calls with `dry_run=true`, retrying safely with `Idempotency-Key`, and submitting destructive changes as approval proposals the human resolves from the dashboard (the agent learns the outcome over SSE, no polling).
5. **The human stays in control**: revoke the grant and the agent is locked out on its next request; the audit log shows both identities on every action.

To make **your own** backend agent-ready the same way, install the packages (error envelope, dry-run, agent metrics) and copy the patterns from `apps/reference` — delegation, approvals, and the MCP generator are all ordinary Express code.

## What You Get

- **Installable toolkit packages** (npm workspaces):
  - [`@standonai/agent-errors`](./packages/agent-errors) — agent-parseable error envelope with mandatory `suggestion`, Express error handler, Spectral ruleset
  - [`@standonai/agent-dry-run`](./packages/agent-dry-run) — `?dry_run=true` validation-without-execution for mutations
  - [`@standonai/agent-metrics`](./packages/agent-metrics) — agent detection + zero-shot success rate tracking
- A reference platform ([`apps/reference`](./apps/reference)) built on those packages:
  - **MCP server at `/mcp`** — tools generated from the OpenAPI spec (streamable HTTP); add it to any MCP client and use the API with zero custom code
  - Agent discovery: `/.well-known/mcp.json` + spec-derived `/llms.txt`
  - JWT auth for users and API-key auth for agents
  - OpenAPI-first API definitions and linting
  - Rate limiting, security headers, and startup validation checks
  - Optional monitoring/audit/secrets features via full profile
- CI workflows for minimal gate and extended validation

## What This Platform Is Not

- Not a complete enterprise product out of the box (SSO, compliance workflows, and org-specific controls are still your responsibility)
- Not tied to a single cloud vendor
- Not a replacement for your business logic, domain models, or production runbooks

## Prerequisites

- Node.js 20+
- npm
- Redis (optional; recommended for distributed lockout/rate-limit controls)

## Install

```bash
npm ci
cp apps/reference/.env.example apps/reference/.env
```

All npm scripts run from the repo root and delegate into the workspaces.

## Required Local Configuration

Set these in `apps/reference/.env` before running:

```env
JWT_SECRET=<long-random-secret>
ALLOWED_ORIGINS=http://localhost:3000
APP_PROFILE=core
```

Use `APP_PROFILE=full` only when you need monitoring/audit/secrets capabilities.

## Run

```bash
# development
npm run dev

# production-like
npm run build
npm start
```

## Quick Verification

```bash
# health
curl http://localhost:3000/api/health

# register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","name":"Example User"}'

# login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# refresh
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<paste-refresh-token>"}'

# MCP: list spec-generated tools (JSON-RPC over streamable HTTP)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <paste-access-token>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# agent discovery
curl http://localhost:3000/.well-known/mcp.json
curl http://localhost:3000/llms.txt
```

## Pre-Deployment Checks

Run these before publishing/deploying:

```bash
npm run type-check
npm run test:targeted
npm run smoke:startup
npm run preflight:prod-env
npm run lint:api
npm run build
```

## Required Production Controls

Minimum recommended production settings:

```env
STRICT_STARTUP_VALIDATION=true
ENFORCE_HTTPS=true
TRUST_PROXY=true
FULL_PROFILE_STRICT=true
```

Also ensure:

- strong non-placeholder `JWT_SECRET`
- explicit production `ALLOWED_ORIGINS`
- durable non-default `DATABASE_URL`

## Operational Commands

```bash
npm run test:targeted
npm run smoke:startup
npm run preflight:prod-env
npm run security:audit
```

## Profiles

- `APP_PROFILE=core`: minimal API surface for most environments
- `APP_PROFILE=full`: enables monitoring extras, audit logs, agent management, and secrets integrations

## Deployment Notes

- Local defaults are not production defaults.
- For private-repo release flow (without branch protection/rulesets), use:
  - [PUBLISHING_CHECKLIST.md](./PUBLISHING_CHECKLIST.md)

## AX Eval

`apps/eval` drives a real Claude agent against this platform and a
deliberately vanilla baseline with the same endpoints, measuring zero-shot
success (task completed with zero API errors en route). Run it with
`ANTHROPIC_API_KEY=... npm run eval`; results land in
`apps/eval/results/latest.md`. See [apps/eval/README.md](./apps/eval/README.md).

## Documentation

- [Roadmap](./ROADMAP.md)
- [Authentication](./AUTHENTICATION.md)
- [Authorization](./AUTHORIZATION.md)
- [Security](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [OpenAPI Spec](./apps/reference/specs/openapi/platform-api.yaml)

## License

[MIT](./LICENSE)
