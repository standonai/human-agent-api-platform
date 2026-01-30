# PRD: API Platform for Humans and AI Agents

**Status:** Draft
**Author:** Sumeet Tandon
**Created:** 2025-01-29
**Approvers:** Engineering Lead, Product, Security/Legal

---

## Problem Statement

Our APIs were designed for human developers writing traditional code. As AI agents, copilots, and natural-language coding workflows become primary consumers of APIs, our current design creates friction:

**For internal teams:**
- No standardized approach for making APIs machine-readable and agent-friendly
- Inconsistent error responses that LLMs struggle to parse and act on
- Missing metadata that agents need for autonomous tool discovery and execution

**For external developers:**
- Third-party developers using AI coding assistants hit integration friction
- Documentation optimized for human reading, not LLM context windows
- No structured guidance for agent-based workflows

**The gap:** We need an API platform that treats human developers AND AI agents as first-class consumers—with disciplined schemas, machine-readable metadata, and structured feedback loops that enable both audiences to succeed.

---

## Goals

### Primary Goals

1. **Reduce time-to-first-successful-call** for both human developers (target: <5 min) and AI agents (target: zero-shot success >80%)
2. **Enable autonomous agent workflows** where LLMs can discover, understand, and correctly invoke APIs without human guidance
3. **Unify DX standards** across internal and external APIs with enforceable governance

### Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Agent zero-shot success rate | Unknown | >80% | % of first API calls by agents that succeed |
| Human time-to-integration | ~2 hours | <30 min | Median time from docs to working call |
| Error self-resolution rate | ~20% | >60% | % of errors resolved without support ticket |
| OpenAPI spec coverage | ~40% | 100% | % of endpoints with valid OpenAPI 3.1 specs |
| Agent-related support tickets | Baseline TBD | -50% | Tickets tagged as agent/LLM integration issues |

---

## Requirements

### Pillar 1: Schema-First API Design

**What to build:**
- Enforce OpenAPI 3.1 specification for all APIs (new and retrofitted)
- JSON Schema definitions with rich metadata (`description`, `examples`, `enum` with explanations)
- AsyncAPI specs for event-driven/webhook endpoints
- Machine-readable capability manifests (what an API can do, not just how)

**Why it matters:**
- LLMs use schemas as context; richer schemas = better reasoning
- Enables automated SDK generation, test generation, and documentation
- Provides single source of truth for humans and agents

**Requirements:**
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| S1 | All endpoints have OpenAPI 3.1 spec | P0 | Blocks agent discovery |
| S2 | Every parameter has description + example | P0 | Critical for LLM context |
| S3 | Enum values include human-readable explanations | P1 | Improves agent decision-making |
| S4 | Async endpoints documented with AsyncAPI | P1 | For webhooks, streaming |
| S5 | Schemas validate in CI/CD pipeline | P0 | Prevent spec drift |

---

### Pillar 2: Structured Error Responses

**What to build:**
- Standardized error envelope with machine-parseable fields
- Actionable remediation hints in error responses
- Error codes that map to documentation and fix suggestions
- Dry-run mode (`?dry_run=true`) for validation without execution

**Why it matters:**
- Agents need to self-correct; vague errors cause retry loops
- Structured errors reduce support burden for both audiences
- Dry-run enables agents to validate before committing

**Error Response Schema:**
```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Human-readable description",
    "target": "field_name",
    "details": [
      {
        "code": "VALUE_OUT_OF_RANGE",
        "message": "limit must be between 1 and 100",
        "suggestion": "Set limit to 100 or use pagination"
      }
    ],
    "doc_url": "https://docs.example.com/errors/INVALID_PARAMETER",
    "request_id": "req_abc123"
  }
}
```

**Requirements:**
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| E1 | All errors use standard envelope | P0 | Enables agent parsing |
| E2 | Errors include `suggestion` field | P0 | Actionable remediation |
| E3 | Error codes link to documentation | P1 | Self-service debugging |
| E4 | Dry-run mode for mutating endpoints | P1 | Agent validation |
| E5 | Rate limit errors include retry-after | P0 | Prevents retry storms |

---

### Pillar 3: Versioning and Deprecation

**What to build:**
- Header-based versioning (`API-Version: 2025-01-01`)
- Deprecation headers with sunset dates
- Breaking change detection in CI
- Migration guides as structured data (not just docs)

**Why it matters:**
- Agents need predictable upgrade paths
- Automated deprecation warnings prevent production surprises
- Structured migration data enables automated upgrades

**Requirements:**
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| V1 | Header-based versioning for all APIs | P0 | Date-based versions |
| V2 | Deprecation warnings in response headers | P0 | `Deprecation`, `Sunset` headers |
| V3 | Breaking change detection in CI | P1 | Fail builds on unintended breaks |
| V4 | Machine-readable migration guides | P2 | JSON format for automated migration |

---

### Pillar 4: Agent-Aware Observability

**What to build:**
- Agent identification header (`X-Agent-ID` or User-Agent parsing)
- Separate dashboards for human vs. agent traffic
- Tool-call tracing (which agent, which prompt, which tool)
- Anomaly detection for agent behavior patterns

**Why it matters:**
- Understand how agents use (and misuse) APIs
- Detect prompt injection or abuse patterns
- Optimize specifically for agent traffic patterns

**Requirements:**
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| O1 | Agent identification mechanism | P0 | Header or UA parsing |
| O2 | Traffic segmentation (human/agent) | P1 | Dashboard filtering |
| O3 | Tool-call correlation tracing | P2 | Trace agent→tool→API |
| O4 | Agent-specific rate limiting | P1 | Different limits for agent traffic |

---

### Pillar 5: AI-Focused DevRel Content

**What to build:**
- LLM-optimized documentation (concise, example-rich, context-window-friendly)
- System prompts and tool definitions for major agent frameworks
- Interactive examples that agents can invoke
- Prompt templates for common integration patterns

**Why it matters:**
- Documentation IS the training data for agent behavior
- Pre-built prompts reduce integration friction dramatically
- Examples that work become the happy path

**Requirements:**
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| D1 | Every endpoint has working code examples | P0 | Copy-paste ready |
| D2 | OpenAI/Anthropic tool definition files | P1 | Ready-to-use tool configs |
| D3 | Documentation fits in 4K token context | P1 | Per-endpoint, not full docs |
| D4 | Prompt templates for common tasks | P2 | "How to create a user" prompts |

---

### Pillar 6: Governance and Compliance

**What to build:**
- API design linting rules (enforce standards)
- Approval workflows for new APIs
- Automated compliance checking (PII detection, auth requirements)
- Audit logging for agent actions

**Why it matters:**
- Agents operating autonomously require guardrails
- Consistent standards across internal/external APIs
- Security/Legal sign-off requires evidence

**Requirements:**
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| G1 | Spectral/Redocly linting in CI | P0 | Enforce design rules |
| G2 | New API approval workflow | P1 | Review before publish |
| G3 | PII/sensitive data detection | P0 | Security requirement |
| G4 | Agent action audit log | P1 | Who did what, when |

---

## Scope

### In Scope (V1)

- **New APIs:** Full compliance with all pillars from day one
- **Existing APIs (Tier 1):** Top 10 highest-traffic APIs retrofitted with OpenAPI specs, structured errors, and versioning
- **Tooling:** CI/CD integration for spec validation and linting
- **Documentation:** Rewrite of Tier 1 API docs in LLM-optimized format
- **Observability:** Agent traffic identification and basic dashboards

### Out of Scope (V1)

- Full retrofit of all legacy APIs (future phases)
- Custom agent frameworks or SDKs
- Real-time prompt injection detection (V2)
- Automated migration tooling for third-party developers

### Constraints

- **Hybrid infrastructure:** Must integrate with existing API gateway (identify which: Kong, Apigee, AWS API Gateway, etc.)
- **Backward compatibility:** Existing integrations must continue working
- **Rollout:** Phased approach—new APIs first, then retrofit by tier

---

## Technical Approach (Engineering Starting Points)

### Phase 1: Foundation (Weeks 1-4)
1. Define and document API design standards (OpenAPI 3.1 template)
2. Set up Spectral linting rules and CI integration
3. Design standard error envelope schema
4. Implement versioning header handling in gateway

### Phase 2: Retrofit (Weeks 5-10)
1. Audit Tier 1 APIs against new standards
2. Generate/validate OpenAPI specs for Tier 1
3. Implement structured error responses
4. Add deprecation header support

### Phase 3: Agent Enablement (Weeks 8-12)
1. Implement agent identification mechanism
2. Build observability dashboards
3. Create tool definition files for OpenAI/Anthropic
4. Rewrite Tier 1 documentation

---

## Open Questions

| # | Question | Owner | Needed By |
|---|----------|-------|-----------|
| 1 | Which API gateway are we building on? What are its extensibility constraints? | Engineering | Week 1 |
| 2 | What's our agent identification strategy? Header-based or UA parsing? | Engineering | Week 2 |
| 3 | Do we need different rate limits for agent vs. human traffic? | Product | Week 3 |
| 4 | What audit logging is required for agent actions? (Security/Legal input) | Security | Week 2 |
| 5 | Which 10 APIs are Tier 1 for retrofit? | Product | Week 1 |
| 6 | Are there existing OpenAPI specs we can salvage, or starting from scratch? | Engineering | Week 1 |
| 7 | What's the sunset policy for deprecated versions? | Product/Legal | Week 4 |
| 8 | How do we handle agent abuse or prompt injection attempts? | Security | Week 6 |

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Engineering Lead | | | Pending |
| Product | | | Pending |
| Security | | | Pending |
| Legal | | | Pending |

---

## Appendix

### A. Reference Standards
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core)
- [AsyncAPI Specification](https://www.asyncapi.com/docs/specifications)
- [RFC 7807 - Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc7807)

### B. Glossary
- **Zero-shot success:** Agent correctly calls API on first attempt without examples
- **Vibe coding:** Natural-language-driven development with AI assistance
- **Tool definition:** Structured description of an API for agent consumption (e.g., OpenAI function calling schema)
- **Dry-run mode:** Validate request without executing side effects
