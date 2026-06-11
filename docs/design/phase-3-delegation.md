# Phase 3 Design: Delegated Authority (agent on behalf of user)

Status: **draft for review** · Roadmap: [Phase 3](../../ROADMAP.md)

## Problem

Today an agent authenticates as an independent principal (`X-Agent-ID` +
`X-Agent-Key`) and owns only its own resources. There is no way to express
the thing human-agent collaboration actually needs: *"agent A may modify
**my** tasks until 5pm, and I can revoke that at any moment."* This is the
platform's core differentiator — and the part with no good off-the-shelf
answer.

## Goals

1. A user can grant an agent **scoped, time-boxed, revocable** authority
   over their resources.
2. Every delegated action is auditable with **both identities** ("agent A
   for user B").
3. Revocation takes effect **immediately**, not at token expiry.
4. Works unchanged over REST and MCP (`Authorization` header is already
   forwarded by the MCP dispatcher).
5. Standard-shaped: OAuth 2.1 token endpoint + RFC 8693 token exchange,
   so future ecosystem tooling (MCP authorization, gateways) can interop.

## Non-goals (explicitly out of scope for Phase 3)

- Browser-based OAuth authorization-code flow / consent screens. Grants
  are created by the user via API or dashboard from an existing session.
- Dynamic client registration (RFC 7591). Agents register as today.
- Refresh tokens for delegated tokens — agents re-exchange while the
  grant is alive.
- Multi-hop delegation (agent delegating to another agent).
- Delegating **role** (admin/developer). Delegation conveys *ownership
  scope of the delegating user only*, never their role.

## Design

### 1. Delegation grants (the consent record)

New table `delegation_grants`:

| column | notes |
|--------|-------|
| `id` | `grant_<n>` |
| `user_id` | the delegating user |
| `agent_id` | the agent being empowered |
| `scopes` | JSON array, e.g. `["tasks:read","tasks:write"]` |
| `expires_at` | hard cap; default 24h, max `DELEGATION_MAX_TTL` (env, default 7d) |
| `revoked_at` | null until revoked |
| `created_at`, `last_used_at` | bookkeeping |

Endpoints (user-session auth required; all in OpenAPI spec + Spectral):

- `POST /api/delegations` — create (body: `agent_id`, `scopes`, `expires_in`)
- `GET /api/delegations` — list own grants (admin: all)
- `DELETE /api/delegations/{id}` — revoke (owner or admin)

### 2. Token endpoint (OAuth 2.1 shaped)

`POST /oauth/token`, two grant types:

- `client_credentials` — agent authenticates with its existing API key
  (`client_id` = agent id, `client_secret` = agent key) and receives a
  short-lived **agent token** (acts as itself; replaces header auth on
  subsequent calls).
- `urn:ietf:params:oauth:grant-type:token-exchange` (RFC 8693) — the agent
  presents its agent token (`subject_token`) plus a `grant_id` (or scopes,
  resolved against active grants) and receives a **delegated token**.

Token response is the standard `{access_token, token_type, expires_in,
scope}` JSON. Errors use the platform envelope with `suggestion`.

### 3. Token format and claims

JWTs signed with the existing `JWT_SECRET`, distinguished from session
tokens by `token_use`:

```json
{
  "token_use": "delegated",
  "sub": "user_42",              // the delegating user — ownership flows from here
  "act": { "sub": "agent_7" },   // RFC 8693 actor claim — who is really calling
  "scope": "tasks:read tasks:write",
  "grant_id": "grant_3",
  "exp": 1718160000              // short: 15 min default (DELEGATED_TOKEN_TTL)
}
```

Agent tokens (`token_use: "agent"`) carry `sub: agent_7` and no `act`.

**Revocation is live**: on every request the auth middleware loads
`grant_id` and rejects if revoked/expired (synchronous better-sqlite3
lookup — same cost profile as the existing API-key check). The short TTL
is defense in depth, not the revocation mechanism.

### 4. Scope taxonomy

Start minimal; one scope family per resource, verbs `read` / `write`
(write includes create/update/delete — split later only if a real need
appears, per the simplicity principle):

- `tasks:read`, `tasks:write`
- `profile:read` (GET /api/auth/me as the user)
- reserved for Phase 4: `approvals:respond`

Enforcement: `requireScope('tasks:write')` middleware on routes; no-op
for session tokens (humans keep full authority over their own data),
enforced for `token_use: agent|delegated`.

### 5. Authorization integration

`requireOwnerOrAdmin` gains one rule: for a delegated token, the
**effective principal is the delegating user** (`sub`), so ownership
checks pass where that user's would — but only when the scope covers the
action and the grant is alive. The agent's own identity (`act.sub`) is
used for rate limiting, agent metrics, and audit.

Audit log entries for delegated calls record `{user_id, agent_id,
grant_id, scopes}` — "agent A for user B" becomes a queryable fact.

### 6. MCP integration

- The MCP dispatcher already forwards `Authorization` — delegated tokens
  work over `/mcp` with zero changes to the MCP layer.
- Add `/.well-known/oauth-protected-resource` metadata and a
  `WWW-Authenticate` header on 401s (per the MCP authorization spec) so
  MCP clients can discover the token endpoint. Minimal authorization
  -server metadata at `/.well-known/oauth-authorization-server`
  (token endpoint + grant types only).

### 7. Metric integrity (closes the "detection theater" critique)

`agentTrackingMiddleware` prefers authenticated identity: token `act.sub`
/ `sub`, or verified `X-Agent-Key` agent — falling back to self-reported
headers only when unauthenticated. The zero-shot metric then measures
*real* agents.

### 8. Migration

- `X-Agent-ID`/`X-Agent-Key` header auth keeps working unchanged (it is
  also the credential for `client_credentials`), logged with a
  deprecation notice when used directly on data routes.
- No change for human JWT sessions.

## Security considerations

| Threat | Mitigation |
|--------|------------|
| Stolen delegated token | 15-min TTL + live grant check; revoke ends it immediately |
| Agent exceeds mandate | scope enforcement + ownership bound to delegating user only |
| Privilege escalation via admin delegator | role never flows through delegation; delegated requests are never admin |
| Confused deputy / attribution | `act` claim mandatory in audit for every delegated call |
| Grant sprawl | default 24h expiry, hard server-side cap, list/revoke endpoints, `last_used_at` for hygiene |

## Implementation slices (one PR each, spec + Spectral in same PR)

1. `delegation_grants` store + CRUD endpoints + OpenAPI.
2. `/oauth/token` (both grant types) + JWT claims + tests.
3. Enforcement: `requireScope`, ownership integration, live revocation
   check, audit fields.
4. MCP/.well-known metadata + 401 `WWW-Authenticate` + metric binding to
   authenticated identity.
5. Docs (AUTHENTICATION.md, AUTHORIZATION.md, llms.txt auth hints) +
   deprecation notice for direct header auth.

## Done when (from ROADMAP)

A user grants an agent time-boxed write access to their tasks; the agent
operates via MCP under that grant; the audit log shows both identities;
revocation takes effect immediately.

## Open questions for review

1. **Scope granularity** — is `tasks:write` (covering delete) acceptable
   for v1, or should `tasks:delete` be separate from day one?
2. **Grant creation UX** — API-only for v1, or also a dashboard page in
   `public/dashboard.html`?
3. **Should `client_credentials` tokens be required** (deprecating direct
   header auth on data routes on a timeline), or remain optional
   indefinitely?
