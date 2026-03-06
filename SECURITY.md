# Security Policy

## Supported Versions

The latest `main` branch is actively maintained for security updates.

## Reporting a Vulnerability

Please do not open public issues for suspected vulnerabilities.

Report security issues privately with:

- affected version/commit
- impact summary
- reproduction details or proof of concept
- suggested remediation (if available)

Until a dedicated security contact is configured, open a private channel with repository maintainers through GitHub security advisories.

## Security Baseline

This project includes:

- strict startup validation controls
- HTTPS enforcement (`ENFORCE_HTTPS`) and proxy safety (`TRUST_PROXY`)
- JWT auth plus refresh-token rotation and revocation
- login brute-force lockout protections
- input sanitization and injection detection
- audit/security event logging
- readiness/liveness health probes

## Production Recommendations

1. Use strong, rotated secrets (`JWT_SECRET`, gateway/API credentials).
2. Set explicit `ALLOWED_ORIGINS` and enforce HTTPS.
3. Use durable production databases and managed Redis.
4. Enable CI security gates (`npm run security:audit`).
5. Monitor alerts for token reuse, lockouts, and dependency degradation.
