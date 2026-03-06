# Publishing Checklist (Private Repo, Current Plan)

Use this checklist when preparing and merging changes to `main` while branch protection/rulesets are unavailable.

## 1) Prepare Local Changes

- Ensure work is on a feature branch, not `main`.
- Update docs/config with any behavior changes.
- Run:

```bash
npm run type-check
npm run test:targeted
npm run smoke:startup
npm run lint
npm run lint:api
npm test
npm run build
```

## 2) Open Pull Request

- Create a PR into `main` (no direct pushes by team convention).
- Include summary, risk notes, and rollback notes.
- Link related issues/tasks.

## 3) CI Gates (Must Be Green)

- `Minimal Gate / Typecheck + Targeted + Startup Smoke`
- `CI / Extended CI (Lint, Full Test, Build)`

Do not merge until both checks pass.

## 4) Review Gates (Team Policy)

- At least 1 human reviewer approval required.
- Reviewer confirms:
  - scope is correct and minimal
  - tests/validation are adequate
  - no secrets or sensitive data in diff
  - migration/config impact is documented

## 5) Merge and Post-Merge Verification

- Merge PR to `main`.
- Verify deployment/environment startup health:
  - `GET /api/health`
  - Auth smoke (register/login/refresh) in non-production test tenant/environment.
  - Check logs for startup validation warnings/errors.

## 6) Security and Dependency Hygiene

- Keep Dependabot vulnerability alerts enabled.
- Keep automated security fixes enabled.
- Review `npm audit`/security findings before release.

## 7) Release Readiness

- Version/tag as needed.
- Update release notes/changelog.
- Confirm README remains accurate for install/run/validation.
