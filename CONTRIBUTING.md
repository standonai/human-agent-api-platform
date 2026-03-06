# Contributing

Thanks for contributing to `human-agent-api-platform`.

## Development Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

## Pull Request Requirements

Before opening a PR, run:

```bash
npm run type-check
npm run lint
npm run lint:api
npm run test:targeted
npm run smoke:startup
```

If your change affects broader behavior, also run:

```bash
npm test
npm run build
```

## Contribution Standards

1. Keep API behavior consistent and documented in OpenAPI specs.
2. Preserve structured error envelopes and actionable suggestions.
3. Add or update tests for functional changes.
4. Avoid introducing insecure defaults for production paths.
5. Keep changes focused; prefer small, reviewable PRs.

## Commit and PR Guidance

- Use clear commit messages describing intent and scope.
- In PR descriptions, include:
  - summary of changes
  - testing performed
  - config/env changes (if any)
  - rollout or migration notes (if any)

## Reporting Issues

Open a GitHub issue with:

- expected behavior
- actual behavior
- reproduction steps
- logs/screenshots (if relevant)
- environment details (OS, Node version, profile/env)
