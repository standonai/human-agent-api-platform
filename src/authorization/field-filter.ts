import { UserRole } from '../types/auth.js';
import { AuthContext, FieldAccessRules, FieldValidationResult } from './types.js';

/**
 * Field Filter - Field-level access control (OWASP API3 protection)
 *
 * Automatically filters response fields and validates update fields
 * based on role and ownership
 */
export class FieldFilter {
  /**
   * Filter response data based on field access rules
   */
  filterResponse<T extends Record<string, any>>(
    data: T,
    context: AuthContext,
    fieldRules: FieldAccessRules
  ): Partial<T> {
    const allowedFields = this.getAllowedReadFields(context, fieldRules);

    // If wildcard (*), return everything
    if (allowedFields.includes('*')) {
      return data;
    }

    // Filter to allowed fields only
    const filtered: Partial<T> = {};
    for (const field of allowedFields) {
      if (field in data) {
        filtered[field as keyof T] = data[field];
      }
    }

    return filtered;
  }

  /**
   * Filter array of response data
   */
  filterResponseArray<T extends Record<string, any>>(
    data: T[],
    context: AuthContext,
    fieldRules: FieldAccessRules
  ): Partial<T>[] {
    return data.map(item => this.filterResponse(item, context, fieldRules));
  }

  /**
   * Validate update fields against write permissions
   */
  validateUpdate(
    updates: Record<string, any>,
    context: AuthContext,
    fieldRules: FieldAccessRules
  ): FieldValidationResult {
    const allowedFields = this.getAllowedWriteFields(context, fieldRules);

    // If wildcard (*), allow everything
    if (allowedFields.includes('*')) {
      return { valid: true };
    }

    // Check for unauthorized fields
    const updateFields = Object.keys(updates);
    const violations: string[] = [];

    for (const field of updateFields) {
      if (!allowedFields.includes(field)) {
        violations.push(field);
      }
    }

    if (violations.length > 0) {
      return {
        valid: false,
        violations,
        suggestion: `You can only modify these fields: ${allowedFields.join(', ')}. Remove: ${violations.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Get allowed read fields for user based on role and ownership
   */
  private getAllowedReadFields(
    context: AuthContext,
    fieldRules: FieldAccessRules
  ): string[] {
    // Check if user is owner
    const isOwner = this.isOwner(context);

    if (isOwner) {
      return fieldRules.read.owner;
    }

    // Fall back to role-based access
    const role = context.user?.role || 'viewer';

    switch (role) {
      case UserRole.ADMIN:
        return fieldRules.read.admin;
      case UserRole.DEVELOPER:
        return fieldRules.read.developer;
      case UserRole.VIEWER:
      default:
        return fieldRules.read.viewer;
    }
  }

  /**
   * Get allowed write fields for user based on role and ownership
   */
  private getAllowedWriteFields(
    context: AuthContext,
    fieldRules: FieldAccessRules
  ): string[] {
    // Check if user is owner
    const isOwner = this.isOwner(context);

    if (isOwner) {
      return fieldRules.write.owner;
    }

    // Fall back to role-based access
    const role = context.user?.role || 'viewer';

    switch (role) {
      case UserRole.ADMIN:
        return fieldRules.write.admin;
      case UserRole.DEVELOPER:
        return fieldRules.write.developer;
      case UserRole.VIEWER:
      default:
        return fieldRules.write.viewer;
    }
  }

  /**
   * Check if user/agent is the owner of the resource
   */
  private isOwner(context: AuthContext): boolean {
    if (!context.resource) return false;

    const ownerId = context.resource.ownerId || context.resource.createdBy;
    if (!ownerId) return false;

    // Check user ownership
    if (context.user?.id === ownerId) return true;

    // Check agent ownership
    if (context.agent?.id === ownerId) return true;

    return false;
  }
}

// Global singleton instance
export const fieldFilter = new FieldFilter();
