/**
 * Authorization Middleware (RBAC)
 *
 * Role-Based Access Control - restricts access based on user role
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/auth.js';
import { ErrorCode } from '../types/errors.js';

/**
 * Require specific role(s) to access endpoint
 *
 * Usage:
 *   app.delete('/api/users/:id',
 *     requireAuth,
 *     requireRole(UserRole.ADMIN),
 *     deleteUser
 *   );
 *
 *   app.post('/api/tasks',
 *     requireAuth,
 *     requireRole(UserRole.ADMIN, UserRole.DEVELOPER),
 *     createTask
 *   );
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if user is authenticated
    if (!req.user) {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'AUTHENTICATION_REQUIRED',
            message: 'You must be authenticated to access this resource',
            suggestion: 'Login via POST /api/auth/login to get an access token',
          }],
          doc_url: 'https://docs.example.com/auth',
        },
      });
      return;
    }

    // Check if user has required role
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: `This action requires ${formatRoles(allowedRoles)} role`,
          target: 'user.role',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Your role (${req.user.role}) doesn't have permission to perform this action`,
            suggestion: `Contact your administrator to upgrade your role to ${formatRoles(allowedRoles)}`,
          }],
          doc_url: 'https://docs.example.com/permissions',
        },
      });
      return;
    }

    // User has required role, proceed
    next();
  };
}

/**
 * Require admin role (shorthand)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole(UserRole.ADMIN)(req, res, next);
}

/**
 * Require admin or developer role (shorthand)
 */
export function requireAdminOrDeveloper(req: Request, res: Response, next: NextFunction): void {
  requireRole(UserRole.ADMIN, UserRole.DEVELOPER)(req, res, next);
}

/**
 * Check if user owns the resource
 *
 * Usage:
 *   app.put('/api/users/:id',
 *     requireAuth,
 *     requireOwnership('id'),  // Check req.params.id === req.user.id
 *     updateUser
 *   );
 */
export function requireOwnership(resourceIdParam: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
          request_id: req.requestId || 'unknown',
        },
      });
      return;
    }

    const resourceId = req.params[resourceIdParam];
    const userId = req.user.id;

    // Admin can access any resource
    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Check ownership
    if (resourceId !== userId) {
      res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'You can only modify your own resources',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'NOT_RESOURCE_OWNER',
            message: `You don't have permission to modify this resource`,
            suggestion: 'You can only modify resources you own',
          }],
        },
      });
      return;
    }

    next();
  };
}

/**
 * Require admin OR resource ownership
 *
 * Allows admins to modify any resource, but regular users can only modify their own
 */
export function requireAdminOrOwnership(resourceIdParam: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
          request_id: req.requestId || 'unknown',
        },
      });
      return;
    }

    // Admin can access anything
    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Check ownership
    const resourceId = req.params[resourceIdParam];
    if (resourceId === req.user.id) {
      next();
      return;
    }

    // Not admin and not owner
    res.status(403).json({
      error: {
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient permissions',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You can only modify your own resources',
          suggestion: 'Login as an admin to modify other users\' resources',
        }],
      },
    });
  };
}

/**
 * Format roles for error messages
 */
function formatRoles(roles: UserRole[]): string {
  if (roles.length === 1) {
    return roles[0];
  }
  if (roles.length === 2) {
    return `${roles[0]} or ${roles[1]}`;
  }
  const last = roles[roles.length - 1];
  const others = roles.slice(0, -1).join(', ');
  return `${others}, or ${last}`;
}
