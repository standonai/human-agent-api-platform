# Authentication

This platform supports three authentication modes:

1. User JWT authentication (`/api/auth/*`) — human sessions
2. Agent tokens (`POST /oauth/token`, `grant_type=client_credentials`) — agents acting as themselves
3. Delegated tokens (`POST /oauth/token`, RFC 8693 token exchange) — agents acting **on behalf of a user** under a delegation grant

Direct `X-Agent-ID`/`X-Agent-Key` header auth on data routes has been
**removed** (it was deprecated in Phase 3). The agent id/key pair is the
credential for `POST /oauth/token` only; everything else uses bearer
tokens. OAuth metadata lives at `/.well-known/oauth-authorization-server`.

## Agent Tokens and Delegation

```bash
# 1. Agent exchanges its API key for a short-lived agent token
curl -X POST localhost:3000/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"agent_1","client_secret":"agnt_..."}'

# 2. A user grants the agent scoped, time-boxed authority (session token required)
curl -X POST localhost:3000/api/delegations \
  -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' \
  -d '{"agent_id":"agent_1","scopes":["tasks:read","tasks:write"],"expires_in":3600}'

# 3. The agent exchanges its agent token for a delegated token
curl -X POST localhost:3000/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:token-exchange","subject_token":"<agent token>","grant_id":"grant_1"}'

# 4. Delegated requests act as the user (ownership) within the granted scopes
curl -X POST localhost:3000/api/v2/tasks \
  -H "Authorization: Bearer <delegated token>" -H 'Content-Type: application/json' \
  -d '{"title":"Created on behalf of the user"}'
```

Delegated tokens carry `sub` = the user, `act.sub` = the agent (RFC 8693),
and are validated against the **live grant on every request** — revoking a
grant (`DELETE /api/delegations/{id}`, or the dashboard) takes effect
immediately, regardless of token expiry. Role never delegates: a delegated
request is never admin. Both identities appear in the audit log.

## User Authentication Flow

### Register

`POST /api/auth/register`

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Example User"
}
```

### Login

`POST /api/auth/login`

Returns:

- `accessToken` (short-lived)
- `refreshToken` (rotated and tracked)

### Refresh

`POST /api/auth/refresh`

- refresh tokens are single-use rotated sessions
- replay/reuse detection triggers revocation escalation

### Logout

`POST /api/auth/logout`

- requires auth + refresh token in body
- revokes the specific refresh session

### Logout All Sessions

`POST /api/auth/logout-all`

- revokes all refresh sessions for the authenticated user

## Session Security Controls

- refresh token sessions persisted with `jti`
- replay detection and security event logging
- max active refresh sessions per user via `REFRESH_TOKEN_MAX_ACTIVE_SESSIONS`
- periodic cleanup via `REFRESH_TOKEN_CLEANUP_INTERVAL_MS`

## Brute-Force Protection

Login attempts are rate-limited/locked out by configurable policy:

- `LOGIN_MAX_ATTEMPTS`
- `LOGIN_ATTEMPT_WINDOW_MS`
- `LOGIN_LOCKOUT_DURATION_MS`

## Related Docs

- [Authorization](./AUTHORIZATION.md)
- [Security Policy](./SECURITY.md)
- [README](./README.md)
