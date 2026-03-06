# Authentication

This platform supports two authentication modes:

1. User JWT authentication (`/api/auth/*`)
2. Agent API key authentication (agent routes and agent-aware middleware)

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
