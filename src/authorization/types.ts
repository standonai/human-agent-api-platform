import { UserRole } from '../types/auth.js';

/**
 * Resource ownership tracking
 */
export interface ResourceOwnership {
  createdBy: string;    // User/agent ID that created resource
  ownerId: string;      // Primary owner (defaults to createdBy)
  updatedBy?: string;   // Last modifier
}

/**
 * Authorization action types
 */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'list';

/**
 * Authorization context passed to policy evaluation
 */
export interface AuthContext {
  user?: { id: string; email: string; role: UserRole };
  agent?: { id: string; name?: string };
  resource?: any;
  action: Action;
}

/**
 * Access rule definition
 */
export interface AccessRule {
  allow: (context: AuthContext) => boolean;
  requireOwnership?: boolean;
  customCheck?: (context: AuthContext, resource?: any) => Promise<boolean> | boolean;
}

/**
 * Field-level access control rules
 */
export interface FieldAccessRules {
  read: {
    owner: string[];      // Fields visible to owner
    admin: string[];      // Fields visible to admin
    developer: string[];  // Fields visible to developer
    viewer: string[];     // Fields visible to viewer
  };
  write: {
    owner: string[];      // Fields owner can modify
    admin: string[];      // Fields admin can modify
    developer: string[];  // Fields developer can modify
    viewer: string[];     // Fields viewer can modify
  };
}

/**
 * Resource policy definition
 */
export interface ResourcePolicy {
  resource: string;
  actions: {
    create?: AccessRule;
    read?: AccessRule;
    update?: AccessRule;
    delete?: AccessRule;
    list?: AccessRule;
  };
  fields?: FieldAccessRules;
}

/**
 * Authorization result
 */
export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

/**
 * Field validation result
 */
export interface FieldValidationResult {
  valid: boolean;
  violations?: string[];
  suggestion?: string;
}
