/**
 * Simple ownership middleware
 *
 * Checks that the caller owns the resource (or is an admin).
 * Replaces the over-engineered OWASP policy engine for common cases.
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../types/errors.js';

/**
 * Require that the caller is the resource owner or an admin.
 *
 * @param resourceType - Human-readable name used in error messages (e.g. 'task')
 * @param resourceLoader - Async function that loads the resource from the request.
 *   Returns null/undefined if the resource does not exist.
 *   The resource must have an `ownerId` or `createdBy` field.
 *
 * On success, attaches the loaded resource to `req.resource`.
 */
export function requireOwnerOrAdmin(
  resourceType: string,
  resourceLoader: (req: Request) => Promise<any> | any
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resource = await resourceLoader(req);

      if (!resource) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: `${resourceType} not found`,
            target: 'id',
            request_id: req.requestId || 'unknown',
            details: [{
              code: 'RESOURCE_NOT_FOUND',
              message: `The ${resourceType} does not exist`,
              suggestion: `Check that the ${resourceType} ID is correct`,
            }],
          },
        });
        return;
      }

      const user  = req.user;
      const agent = req.agent;

      // Admin bypasses ownership check
      if (user?.role === 'admin') {
        (req as any).resource = resource;
        next();
        return;
      }

      const callerId  = user?.id ?? agent?.id;
      const ownerId   = resource.ownerId ?? resource.createdBy;

      if (callerId && callerId === ownerId) {
        (req as any).resource = resource;
        next();
        return;
      }

      res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: `You do not own this ${resourceType}`,
          target: 'ownerId',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'OWNERSHIP_REQUIRED',
            message: 'You do not own this resource',
            suggestion: 'Only the resource owner or an admin can perform this action',
          }],
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
