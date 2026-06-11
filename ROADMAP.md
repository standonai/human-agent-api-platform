# Roadmap

This roadmap converts the platform from a monolithic starter app into an
agent-ready toolkit for the MCP era. Phases are ordered so each one de-risks
the next: cut first, restructure second, then build the three differentiators
(MCP surface, delegation, human-in-the-loop), then prove the thesis with a
published eval.

**The assets worth amplifying** (everything else serves these):

- Error envelope with mandatory `suggestion`, enforced by Spectral — agents
  self-correct from structured errors.
- `agent_zero_shot_success_rate` — "did the agent succeed on its first call"
  as a first-class AX (agent experience) metric.
- Dry-run mode on all mutations — the safety primitive that approval
  workflows build on.

---

## Phase 0 — Cut and clean *(complete — PR #13)*

Make the repo honest before restructuring it.

- [x] Delete `src/gateway/` (~2,000 LOC), `src/cli/sync-gateway.ts`,
      `src/api/gateway-routes.ts`, the `gateway:*` npm scripts, and gateway
      paths/tags in the OpenAPI spec.
- [x] Trim `src/secrets/` to the env provider plus the provider interface.
      Vault/AWS/Azure are "implement the interface" documentation, not
      shipped code. Cloud SDK optionalDependencies dropped.
- [x] Verify `dist/`, `logs/`, `data/*.db*`, and `certs/` are untracked
      (they already were — only present locally).
- [x] Remove the `admin123` bootstrap default. Seeding now generates a
      random password printed once unless `BOOTSTRAP_ADMIN_PASSWORD` is set.
- [x] Reconcile README ↔ CLAUDE.md (profiles, commands, env vars).

## Phase 1 — Restructure into a toolkit + reference app *(complete)*

Convert the asset from "a monolith" into "things people can install."

- [x] Convert to npm workspaces:

  ```
  packages/
    agent-errors/      # envelope types, ApiError, error-builder, doc-url,
                       # Express error handler, Spectral ruleset artifact
    agent-dry-run/     # dryRunMiddleware + withDryRun
    agent-metrics/     # agent detection, metrics store, zero-shot tracking
                       # (Prometheus-free: publish via onZeroShotRate())
  apps/
    reference/         # the platform server, consuming the packages
  ```

- [x] Packages are framework-light: Express adapters only, core logic in
      plain functions; no prom-client dependency (the app's exporter
      subscribes via `onZeroShotRate`).
- [x] Verified externally: `npm pack` + install in a fresh project yields
      working envelope, dry-run, zero-shot tracking, and the Spectral
      ruleset artifact.
- [ ] Versioning/publish pipeline (changesets + npm publish under the
      `@standonai` scope) — deferred until first publish; scope name is
      rename-safe until then.

## Phase 2 — MCP-native surface *(complete)*

Any API built on this platform automatically *is* an MCP server.

- [x] OpenAPI → MCP tool generator (`src/tools/mcp-converter.ts` +
      `src/mcp/tool-catalog.ts`). OpenAPI metadata maps to MCP annotations
      (`GET` → `readOnlyHint`, `DELETE` → `destructiveHint` +
      `idempotentHint`). Admin tags (audit/secrets/monitoring/agents) are
      excluded by default; override with `MCP_TOOL_TAGS`.
- [x] MCP server at `/mcp` (`@modelcontextprotocol/sdk`, streamable HTTP,
      stateless). Tool calls dispatch as real HTTP requests through the
      full middleware stack (loopback executor) so REST and MCP semantics
      are identical — auth headers are forwarded, errors keep their
      `suggestion` field.
- [x] Every mutation tool gains a `dry_run` input mapping to
      `?dry_run=true`; destructive tools are previewable.
- [x] Discovery: `/.well-known/mcp.json` + `/llms.txt`, both generated
      from the spec at runtime so they cannot drift.
- [x] Verified live: task create → list → delete round trip over JSON-RPC
      with a real JWT, including dry-run preview and suggestion-bearing
      error results.
- The OpenAI/Anthropic converters remain as secondary outputs of the same
  parser (`/api/convert`).

## Phase 3 — Delegation: agents acting on behalf of users *(complete)*

The feature that makes "human-agent" true.
Design: [docs/design/phase-3-delegation.md](docs/design/phase-3-delegation.md).

- [x] OAuth 2.1 token endpoint `/oauth/token`: `client_credentials` (agent
      as itself, using existing API keys) + RFC 8693 token exchange for
      delegated tokens (`sub` = user, `act.sub` = agent, `scope`,
      `grant_id`; 15-min TTL).
- [x] `delegation_grants` table + `POST/GET /api/delegations`,
      `DELETE /api/delegations/{id}` (session tokens only — agents cannot
      mint their own authority) + dashboard Delegations panel.
- [x] Delegated requests act as the delegating user for ownership; scopes
      (`tasks:read`/`tasks:write`/`profile:read`) enforced; **role never
      delegates** (pinned to viewer).
- [x] Revocation is live: every request re-checks the grant row; revoked
      grants kill outstanding tokens immediately (`GRANT_REVOKED` with a
      suggestion).
- [x] Audit log records both identities (`delegation: {grantId, userId,
      agentId, scopes}`); identity extraction fixed to run at response
      time so route-level auth is captured at all.
- [x] MCP wiring: `WWW-Authenticate` on 401s,
      `/.well-known/oauth-protected-resource` +
      `/.well-known/oauth-authorization-server`; delegated tokens work
      over `/mcp` unchanged.
- [x] Zero-shot metric now binds to authenticated agent identity
      (self-reported `X-Agent-ID` no longer feeds the metric).
- [x] Migration: direct header auth on data routes still works but returns
      a `Deprecation` header; removal planned for the release after
      Phase 3.

**Done when** *(verified in `delegation-flow.test.ts`)*: a user grants an
agent time-boxed write access to their tasks; the agent operates via MCP
under that grant; the audit log shows the pair; revocation takes effect
immediately.

## Phase 4 — Human-in-the-loop + async work

Collaboration, not coexistence.

- **Approvals:** `?require_approval=true` on mutations → validated via the
  dry-run path → stored in `pending_changes` → human approves/rejects (API +
  dashboard page) → idempotent execution on approval. Policy hook so
  operators can *require* approval for destructive ops by delegated agents.
- **Idempotency keys:** `Idempotency-Key` header on mutations with response
  replay. Makes agent retries safe and stops replays from polluting the
  zero-shot metric.
- **Async jobs:** 202 + `status_url` with SSE for completion. Implement for
  one real operation (approval resolution) rather than abstract machinery.
- Trim the AsyncAPI spec to what is actually implemented.

**Done when:** an agent can propose a destructive change, a human approves
it from the dashboard, and the agent learns the outcome without polling.

## Phase 5 — Prove it: the AX eval

The artifact that sells everything above.

- Eval harness: drive a real agent (Claude via the API) through ~15–20 task
  scenarios against two targets — the reference app and a deliberately
  "vanilla" baseline (same endpoints, plain 400s, no suggestions, no
  dry-run).
- Measure zero-shot success rate, retries-to-success, and token cost per
  completed task, using the Phase 3 identity-bound metrics.
- Publish the results table in the README; run the eval in CI on a schedule
  so the claim stays live.

**Done when:** the README can truthfully say "agents complete tasks
zero-shot N% more often against this platform than a baseline API," with
reproducible numbers.

---

## Sequencing notes and risks

- Phases 0–1 are mechanical; do not merge them into later feature work.
- Phase 3 carries the real design decisions (token format, grant UX, scope
  taxonomy); draft its design doc while Phase 2 is in flight.
- Biggest drift risk: the hand-maintained OpenAPI spec. Every phase that
  touches routes must update spec + Spectral in the same PR, or the Phase 2
  generated MCP surface will lie about the API.
- If scope must be cut, defer Phase 4's async-jobs half. Approvals are not
  deferrable — they are the collaboration story.
