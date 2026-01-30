/**
 * Main entry point for the API platform
 */

export * from './types/errors.js';
export * from './types/versioning.js';
export * from './types/agent.js';
export * from './utils/error-builder.js';

// Re-export middleware with explicit names to avoid conflicts
export {
  requestIdMiddleware,
  generateRequestId,
  versioningMiddleware,
  isSupportedVersion,
  getLatestVersion,
  agentTrackingMiddleware,
  isAgentRequest,
  getAgentType,
  errorHandler,
  asyncHandler,
  dryRunMiddleware,
  isDryRun,
  withDryRun,
} from './middleware/index.js';

export type { VersionConfig } from './middleware/versioning.js';
export type { ErrorHandlerConfig } from './middleware/error-handler.js';

// Export ApiError from middleware (not types) to avoid conflict
export { ApiError } from './middleware/error-handler.js';
