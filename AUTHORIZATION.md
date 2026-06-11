# Authorization

Three small mechanisms cover the platform's authorization needs (the old
policy-engine described in earlier versions of this doc was deleted —
see "What Was Intentionally Not Built" in CLAUDE.md).

## 1. Ownership (`requireOwnerOrAdmin`)

`src/middleware/ownership.ts` — a resource is accessible to its owner
(`ownerId`/`createdBy`) or an admin. Covers OWASP API1 (Broken Object
Level Authorization) for the data routes.

```ts
router.put('/:id', ...requireTaskWrite,
  requireOwnerOrAdmin('task', (req) => dbGetTask(req.params.id)),
  handler);
```

## 2. Roles (`requireRole`, `requireAdmin`)

`src/middleware/authorization.ts` — RBAC for admin/ops surfaces
(audit, agents, secrets routes). Roles: `admin`, `developer`, `viewer`.

## 3. Scopes (delegated tokens only)

`src/middleware/scopes.ts` — when a request authenticates with a
**delegated token** (an agent acting on behalf of a user, see
[AUTHENTICATION.md](./AUTHENTICATION.md)), the grant's scopes must cover
the action:

| Scope | Allows |
|-------|--------|
| `tasks:read` | GET task routes |
| `tasks:write` | create/update/delete tasks |
| `profile:read` | GET /api/auth/me as the user |

Human sessions are not scoped (full authority over their own resources);
agent tokens are bounded by ownership of the agent's own resources.

## How delegation composes with ownership

For a delegated request the **effective principal is the delegating
user** — `req.user` is the user, so ownership checks pass exactly where
that user's would. Two hard limits apply on top:

- **Scopes** — the action must be covered by the grant.
- **Role never delegates** — `req.user.role` is pinned to `viewer` for
  delegated requests. An agent delegated by an admin cannot see other
  users' resources or reach admin surfaces.

Revocation (`DELETE /api/delegations/{id}`) is checked live on every
request; outstanding delegated tokens die immediately with a
`GRANT_REVOKED` error that tells the agent what to do next.

## Audit

Every delegated call is recorded with both identities:
`{userId, agentId, grantId, scopes}` — "agent A for user B" is a
queryable fact in the audit log.
