# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository implements an API platform designed as a first-class experience for both human developers and AI agents. The core philosophy is that APIs should be machine-readable, self-documenting, and enable autonomous agent workflows while maintaining excellent human developer experience.

## Design Principles

Before implementing any feature, ask these questions to ensure we're building the right thing:

1. **"How can I make this simpler?"**
   - Every line of code is a liability. Remove everything unnecessary.
   - The best code is no code. The second best is simple, obvious code.

2. **"What's the one thing this absolutely must do perfectly?"**
   - Identify the core requirement. Everything else is negotiable.
   - Perfect execution of the essential beats good execution of everything.

3. **"Where am I adding complexity that users don't value?"**
   - Features are not benefits. Cut features users won't use or understand.
   - Configuration options multiply complexity exponentially.

4. **"What would this be like if it just worked magically?"**
   - Zero configuration should be the default. Smart defaults everywhere.
   - The common case should be trivial. Advanced cases merely possible.

5. **"How would I make this insanely great instead of just good?"**
   - Good is the enemy of great. Excellence in the essential matters more than completeness.
   - Focus creates quality. Breadth creates mediocrity.

6. **"What am I including because I can, not because I should?"**
   - Technical capability doesn't justify feature existence.
   - "We could add..." is rarely followed by something users need.

7. **"How can I make the complex appear simple?"**
   - Hide complexity, don't expose it. The internal can be sophisticated; the interface must be obvious.
   - Abstraction should reduce cognitive load, not relocate it.

8. **"Where am I compromising that I shouldn't be?"**
   - Some things demand perfection: error messages, agent guidance, core functionality.
   - Other things demand speed: getting to market, proving concepts, iterating.
   - Know which is which.

9. **"How can I make this feel inevitable instead of complicated?"**
   - When users see it, they should think "obviously this is how it works."
   - If you're explaining, you're already losing.

**Application of these principles:**
- Rate limiting: Went from 150 lines with 7 config options → 60 lines, zero-config with 2 optional overrides
- Error responses: Every error includes actionable suggestions, not just descriptions
- Versioning: Single header, automatic deprecation warnings, zero breaking changes
- Agent detection: Automatic, invisible, just works

These principles prioritize:
- **Simplicity** over flexibility
- **Clarity** over comprehensiveness
- **Defaults** over configuration
- **User value** over technical sophistication

## Architecture Pillars

The platform is built around six core pillars that should inform all implementation decisions:

### 1. Schema-First Design
- All APIs MUST have OpenAPI 3.1 specifications
- AsyncAPI specs required for event-driven/webhook endpoints
- Every parameter needs descriptions and examples (critical for LLM context)
- Enum values include human-readable explanations
- Schemas validate automatically in CI/CD

### 2. Structured Error Responses
All error responses follow this standardized envelope:
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

**Critical:** Every error must include actionable `suggestion` field to enable agent self-correction.

### 3. Versioning Strategy
- Header-based versioning using `API-Version: YYYY-MM-DD` format (date-based)
- Deprecation warnings via standard headers: `Deprecation`, `Sunset`
- Breaking changes detected automatically in CI
- Migration guides provided as structured data, not just prose

### 4. Agent-Aware Observability
- Agent identification via `X-Agent-ID` header or User-Agent parsing
- Separate traffic analytics for human vs. agent consumers
- Tool-call tracing to understand agent→tool→API flow
- Distinct rate limiting strategies for agent traffic

### 5. AI-Focused Documentation
- Documentation optimized for LLM context windows (concise, example-rich)
- Per-endpoint docs should fit within 4K tokens
- Every endpoint requires working code examples (copy-paste ready)
- Pre-built tool definitions for OpenAI/Anthropic agent frameworks
- Prompt templates for common integration patterns

### 6. Governance
- API design linting enforced via Spectral/Redocly in CI
- PII and sensitive data detection in automated checks
- Audit logging for all agent actions
- Approval workflows for new API publication

## Key Design Decisions

**Gateway Integration:** The platform must integrate with existing API gateway infrastructure (Kong/Apigee/AWS API Gateway - to be determined).

**Backward Compatibility:** All changes must maintain compatibility with existing integrations.

**Dry-Run Mode:** Mutating endpoints should support `?dry_run=true` parameter for validation without execution, enabling agents to validate requests before committing.

**Rate Limiting:** Rate limit errors must include `retry-after` information to prevent retry storms from agent clients.

## Success Metrics

When implementing features, keep these targets in mind:
- Agent zero-shot success rate: >80% (agents succeed on first API call attempt)
- Human time-to-integration: <30 minutes from docs to working call
- Error self-resolution rate: >60% (errors resolved without support tickets)
- OpenAPI spec coverage: 100% of endpoints

## Implementation Phases

**Phase 1 (Weeks 1-4) - Foundation:**
- Define API design standards and OpenAPI 3.1 templates
- Set up Spectral linting rules and CI integration
- Implement standard error envelope schema
- Add versioning header handling in gateway

**Phase 2 (Weeks 5-10) - Retrofit:**
- Audit and retrofit Tier 1 APIs (top 10 highest-traffic)
- Generate/validate OpenAPI specs
- Implement structured error responses
- Add deprecation header support

**Phase 3 (Weeks 8-12) - Agent Enablement:**
- Implement agent identification mechanism
- Build observability dashboards
- Create tool definition files
- Rewrite documentation for LLM consumption

## Reference Standards

- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core)
- [AsyncAPI Specification](https://www.asyncapi.com/docs/specifications)
- [RFC 7807 - Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc7807)

## Terminology

- **Zero-shot success:** Agent correctly calls API on first attempt without prior examples
- **Tool definition:** Structured description of an API for agent consumption (e.g., OpenAI function calling schema)
- **Dry-run mode:** Validate request without executing side effects
