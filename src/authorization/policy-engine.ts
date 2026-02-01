import {
  ResourcePolicy,
  AuthContext,
  Action,
  AuthorizationResult,
  FieldAccessRules,
} from './types.js';

/**
 * Policy Engine - Centralized authorization logic
 *
 * Zero-config by default, declarative policies, simple API
 */
export class PolicyEngine {
  private policies: Map<string, ResourcePolicy> = new Map();

  /**
   * Register a resource policy
   */
  registerPolicy(policy: ResourcePolicy): void {
    this.policies.set(policy.resource, policy);
  }

  /**
   * Authorize an action on a resource
   */
  async authorize(
    resource: string,
    action: Action,
    context: AuthContext
  ): Promise<AuthorizationResult> {
    const policy = this.policies.get(resource);

    if (!policy) {
      return {
        allowed: false,
        reason: `No policy found for resource: ${resource}`,
        suggestion: `Register a policy for ${resource} using policyEngine.registerPolicy()`,
      };
    }

    const rule = policy.actions[action];

    if (!rule) {
      return {
        allowed: false,
        reason: `Action ${action} not defined in policy for ${resource}`,
        suggestion: `Add ${action} action to ${resource} policy`,
      };
    }

    // 1. Check basic allow rule
    const basicAllowed = rule.allow(context);
    if (!basicAllowed) {
      return {
        allowed: false,
        reason: `User does not have permission to ${action} ${resource}`,
        suggestion: this.getSuggestionForAction(action, context),
      };
    }

    // 2. Check ownership if required
    if (rule.requireOwnership && context.resource) {
      const isOwner = this.checkOwnership(context);
      const isAdmin = context.user?.role === 'admin';

      if (!isOwner && !isAdmin) {
        return {
          allowed: false,
          reason: `Resource ownership required to ${action} this ${resource}`,
          suggestion: `Only the resource owner or an admin can ${action} this ${resource}`,
        };
      }
    }

    // 3. Run custom checks if provided
    if (rule.customCheck) {
      const customAllowed = await rule.customCheck(context, context.resource);
      if (!customAllowed) {
        return {
          allowed: false,
          reason: `Custom authorization check failed for ${action} on ${resource}`,
          suggestion: `Contact an administrator for access`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get field access rules for a resource
   */
  getFieldRules(resource: string): FieldAccessRules | undefined {
    return this.policies.get(resource)?.fields;
  }

  /**
   * Check if user/agent is the owner of the resource
   */
  private checkOwnership(context: AuthContext): boolean {
    if (!context.resource) return false;

    const ownerId = context.resource.ownerId || context.resource.createdBy;
    if (!ownerId) return false;

    // Check user ownership
    if (context.user?.id === ownerId) return true;

    // Check agent ownership
    if (context.agent?.id === ownerId) return true;

    return false;
  }

  /**
   * Generate actionable suggestion based on action and context
   */
  private getSuggestionForAction(action: Action, context: AuthContext): string {
    if (!context.user && !context.agent) {
      return `Authentication required to ${action} resources`;
    }

    switch (action) {
      case 'create':
        return `Your role does not have permission to create resources. Contact an administrator.`;
      case 'read':
        return `You can only read resources you own or have been granted access to.`;
      case 'update':
        return `You can only update resources you own. Admins can update any resource.`;
      case 'delete':
        return `You can only delete resources you own. Admins can delete any resource.`;
      case 'list':
        return `Your role does not have permission to list resources.`;
      default:
        return `Contact an administrator for access.`;
    }
  }
}

// Global singleton instance
export const policyEngine = new PolicyEngine();
