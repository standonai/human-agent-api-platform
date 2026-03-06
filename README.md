# Human-Agent API Platform

A TypeScript/Express API platform for human and agent clients, with OpenAPI specs, auth, security controls, and operational checks.

## What You Get

- JWT auth for users and API-key auth for agents
- OpenAPI-first API definitions and linting
- Rate limiting, security headers, and startup validation checks
- Optional gateway/monitoring/secrets features via full profile
- CI workflows for minimal gate and extended validation

## Prerequisites

- Node.js 20+
- npm
- Redis (optional; recommended for distributed lockout/rate-limit controls)

## Install

```bash
npm ci
cp .env.example .env
```

## Required Local Configuration

Set these in `.env` before running:

```env
JWT_SECRET=<long-random-secret>
ALLOWED_ORIGINS=http://localhost:3000
APP_PROFILE=core
```

Use `APP_PROFILE=full` only when you need gateway/monitoring/secrets capabilities.

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
npm run gateway:status
```

## Profiles

- `APP_PROFILE=core`: minimal API surface for most environments
- `APP_PROFILE=full`: enables gateway sync, monitoring extras, and secrets integrations

## Deployment Notes

- Local defaults are not production defaults.
- For private-repo release flow (without branch protection/rulesets), use:
  - [PUBLISHING_CHECKLIST.md](./PUBLISHING_CHECKLIST.md)

## Documentation

- [Authentication](./AUTHENTICATION.md)
- [Authorization](./AUTHORIZATION.md)
- [Security](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [OpenAPI Spec](./specs/openapi/platform-api.yaml)

## License

[MIT](./LICENSE)
