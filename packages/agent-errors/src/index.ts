/**
 * @standonai/agent-errors
 *
 * Agent-parseable error envelope: every error carries a machine-readable
 * code, a human-readable message, and a mandatory `suggestion` so agents
 * can self-correct without human help. Ships with an Express error-handler
 * adapter and a Spectral ruleset (`@standonai/agent-errors/spectral.yaml`)
 * that enforces the envelope in OpenAPI specs.
 */

export * from './errors.js';
export * from './error-builder.js';
export * from './docs-url.js';
export type { ErrorHandlerConfig } from './error-handler.js';
// The ApiError class (Express adapter) shadows the ApiError envelope
// interface from errors.js; import the interface via the ./errors subpath.
export { errorHandler, asyncHandler, ApiError } from './error-handler.js';
