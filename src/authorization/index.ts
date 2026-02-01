/**
 * Fine-Grained Authorization System
 *
 * Addresses OWASP API1 (Broken Object Level Authorization) and
 * API3 (Broken Property Level Authorization)
 *
 * Features:
 * - Object-level ownership checks on every resource access
 * - Field-level access control for read/write operations
 * - Declarative policy engine for centralized authorization logic
 * - Zero-config defaults with smart policies
 * - Automatic ownership tracking (createdBy, ownerId, updatedBy)
 */

// Core engine
export { policyEngine, PolicyEngine } from './policy-engine.js';
export { fieldFilter, FieldFilter } from './field-filter.js';

// Middleware
export {
  requireResourceAccess,
  requireResourceOwnership,
  validateFieldUpdates,
  filterResponseFields,
} from './middleware.js';

// Types
export type {
  ResourceOwnership,
  Action,
  AuthContext,
  AccessRule,
  FieldAccessRules,
  ResourcePolicy,
  AuthorizationResult,
  FieldValidationResult,
} from './types.js';

// Policies
export { taskPolicy } from './policies/task-policy.js';
export { userPolicy } from './policies/user-policy.js';
export { agentPolicy } from './policies/agent-policy.js';
export { secretPolicy } from './policies/secret-policy.js';

/**
 * Initialize authorization system
 *
 * Registers all policies with the policy engine
 */
export async function initializeAuthorization(): Promise<void> {
  const { policyEngine } = await import('./policy-engine.js');
  const { taskPolicy } = await import('./policies/task-policy.js');
  const { userPolicy } = await import('./policies/user-policy.js');
  const { agentPolicy } = await import('./policies/agent-policy.js');
  const { secretPolicy } = await import('./policies/secret-policy.js');

  policyEngine.registerPolicy(taskPolicy);
  policyEngine.registerPolicy(userPolicy);
  policyEngine.registerPolicy(agentPolicy);
  policyEngine.registerPolicy(secretPolicy);
}
