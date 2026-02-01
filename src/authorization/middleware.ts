import { Request, Response, NextFunction } from 'express';
import { policyEngine } from './policy-engine.js';
import { fieldFilter } from './field-filter.js';
import { AuthContext, Action } from './types.js';
import { ErrorCode } from '../types/errors.js';
import { ApiError } from '../middleware/error-handler.js';

/**
 * Authorization Middleware - Route protection functions
 */

/**
 * Require resource access based on policy
 *
 * @param resourceType - Resource type (e.g., 'task', 'user')
 * @param action - Action being performed
 * @param resourceLoader - Function to load resource from request
 */
export function requireResourceAccess(
  resourceType: string,
  action: Action,
  resourceLoader?: (req: Request) => any | Promise<any>
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Load resource if loader provided
      let resource: any = undefined;
      if (resourceLoader) {
        resource = await resourceLoader(req);
        if (!resource && (action === 'read' || action === 'update' || action === 'delete')) {
          return next(
            new ApiError(
              404,
              ErrorCode.NOT_FOUND,
              `${resourceType} not found`,
              'id',
              [{
                code: 'RESOURCE_NOT_FOUND',
                message: `The ${resourceType} does not exist`,
                suggestion: `Check that the ${resourceType} ID is correct`,
              }]
            )
          );
        }
      }

      // Build auth context
      const context: AuthContext = {
        user: (req as any).user,
        agent: (req as any).agent,
        resource,
        action,
      };

      // Evaluate policy
      const result = await policyEngine.authorize(resourceType, action, context);

      if (!result.allowed) {
        return next(
          new ApiError(
            403,
            ErrorCode.FORBIDDEN,
            result.reason || 'Access denied',
            resourceType,
            [{
              code: 'AUTHORIZATION_FAILED',
              message: result.reason || 'Access denied',
              suggestion: result.suggestion || 'Contact an administrator for access',
            }]
          )
        );
      }

      // Attach resource to request for downstream use
      if (resource) {
        (req as any).resource = resource;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Simple ownership check (legacy compatibility)
 *
 * @param resourceType - Resource type
 * @param resourceLoader - Function to load resource
 */
export function requireResourceOwnership(
  resourceType: string,
  resourceLoader: (req: Request) => any | Promise<any>
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const resource = await resourceLoader(req);

      if (!resource) {
        return next(
          new ApiError(
            404,
            ErrorCode.NOT_FOUND,
            `${resourceType} not found`,
            'id',
            [{
              code: 'RESOURCE_NOT_FOUND',
              message: `The ${resourceType} does not exist`,
              suggestion: `Check that the ${resourceType} ID is correct`,
            }]
          )
        );
      }

      const user = (req as any).user;
      const agent = (req as any).agent;
      const ownerId = resource.ownerId || resource.createdBy;

      // Check ownership or admin
      const isOwner = (user?.id === ownerId) || (agent?.id === ownerId);
      const isAdmin = user?.role === 'admin';

      if (!isOwner && !isAdmin) {
        return next(
          new ApiError(
            403,
            ErrorCode.NOT_RESOURCE_OWNER,
            `You do not own this ${resourceType}`,
            'ownerId',
            [{
              code: 'OWNERSHIP_REQUIRED',
              message: 'You do not own this resource',
              suggestion: `Only the resource owner or an admin can perform this action`,
            }]
          )
        );
      }

      // Attach resource to request
      (req as any).resource = resource;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate field updates against write permissions
 *
 * @param resourceType - Resource type
 */
export function validateFieldUpdates(resourceType: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const fieldRules = policyEngine.getFieldRules(resourceType);

      if (!fieldRules) {
        // No field rules defined, allow all updates
        return next();
      }

      const context: AuthContext = {
        user: (req as any).user,
        agent: (req as any).agent,
        resource: (req as any).resource,
        action: 'update',
      };

      const result = fieldFilter.validateUpdate(req.body, context, fieldRules);

      if (!result.valid) {
        return next(
          new ApiError(
            403,
            ErrorCode.UNAUTHORIZED_FIELD_UPDATE,
            `Unauthorized field update attempted`,
            result.violations?.join(', '),
            [{
              code: 'FIELD_UPDATE_DENIED',
              message: 'You cannot modify these fields',
              suggestion: result.suggestion || 'Remove unauthorized fields from update',
              target: result.violations?.join(', '),
            }]
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Filter response fields based on read permissions
 *
 * @param resourceType - Resource type
 */
export function filterResponseFields(resourceType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const fieldRules = policyEngine.getFieldRules(resourceType);

      if (!fieldRules) {
        // No field rules defined, no filtering needed
        return next();
      }

      const context: AuthContext = {
        user: (req as any).user,
        agent: (req as any).agent,
        resource: (req as any).resource,
        action: 'read',
      };

      // Wrap res.json to auto-filter responses
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        if (body && typeof body === 'object') {
          // Handle data envelope
          if (body.data) {
            if (Array.isArray(body.data)) {
              body.data = fieldFilter.filterResponseArray(body.data, context, fieldRules);
            } else {
              body.data = fieldFilter.filterResponse(body.data, context, fieldRules);
            }
          } else {
            // Filter body directly if no envelope
            if (Array.isArray(body)) {
              body = fieldFilter.filterResponseArray(body, context, fieldRules);
            } else {
              body = fieldFilter.filterResponse(body, context, fieldRules);
            }
          }
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
