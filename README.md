# API Platform for Humans and AI Agents

An API platform designed to provide a first-class experience for both human developers and AI agents, with machine-readable schemas, structured errors, and autonomous workflow support.

## Project Status

**Phase:** Foundation Setup (Phase 1)
**Version:** 0.1.0

## Quick Start

```bash
# Install dependencies
npm install

# Run development server (starts on port 3002)
npm run dev

# Build project
npm run build

# Run tests
npm test

# Lint API specifications
npm run lint:api

# Generate AI agent tool definitions
npm run generate:tools -- -i specs/my-api.yaml -o tools/my-api
```

## Project Structure

```
├── src/
│   ├── schemas/         # Zod schemas for validation
│   ├── middleware/      # Express middleware (versioning, error handling, agent tracking)
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions
├── specs/
│   ├── openapi/        # OpenAPI 3.1 specifications
│   ├── asyncapi/       # AsyncAPI specifications
│   └── templates/      # Reusable spec templates
├── docs/
│   ├── guides/         # Developer guides
│   └── examples/       # Code examples
└── tests/              # Test files
```

## Architecture

See [CLAUDE.md](./CLAUDE.md) for detailed architectural guidance and the six core pillars:
1. Schema-First API Design
2. Structured Error Responses
3. Versioning and Deprecation
4. Agent-Aware Observability
5. AI-Focused Documentation
6. Governance and Compliance

## Key Features

### Middleware
- **Request ID**: Unique request tracking across services
- **Versioning**: Header-based API versioning with deprecation support
- **Agent Tracking**: Automatic AI agent identification and observability
- **Dry-Run Mode**: Validate requests without execution
- **Error Handling**: Standardized error responses with actionable suggestions

### Tool Generation
Automatically convert OpenAPI specifications into AI agent tool definitions:
- **OpenAI Function Calling** format
- **Anthropic Claude Tools** format
- CLI tool for easy generation
- Programmatic API for integration

See [Tool Generation Guide](./docs/guides/tool-generation.md) for details.

## Development

This project uses:
- **TypeScript** for type safety
- **Express** for the reference server
- **Spectral** for OpenAPI/AsyncAPI linting
- **Vitest** for testing
- **ESLint** for code linting

## Contributing

All APIs must follow the platform standards:
- OpenAPI 3.1 specifications with full descriptions and examples
- Standardized error responses with actionable suggestions
- Header-based versioning (`API-Version: YYYY-MM-DD`)
- Agent identification support

## License

MIT
