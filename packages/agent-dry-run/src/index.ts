/**
 * Dry-run mode middleware
 * Enables validation without execution for mutating operations
 */

import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      isDryRun: boolean;
    }
  }
}

/**
 * Middleware that detects dry-run mode from query parameter
 */
export function dryRunMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check for dry_run query parameter
  req.isDryRun = req.query.dry_run === 'true' || req.query.dry_run === '1';

  // Add header to indicate dry-run mode
  if (req.isDryRun) {
    res.setHeader('X-Dry-Run', 'true');
  }

  next();
}

/**
 * Helper to check if request is in dry-run mode
 */
export function isDryRun(req: Request): boolean {
  return req.isDryRun === true;
}

/**
 * Wrapper for mutation handlers to support dry-run
 */
export function withDryRun<T>(
  validator: (req: Request) => T | Promise<T>,
  executor: (req: Request, validated: T) => any | Promise<any>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Always run validation
      const validated = await Promise.resolve(validator(req));

      // If dry-run, return validation success without executing
      if (req.isDryRun) {
        res.status(200).json({
          dry_run: true,
          validation: 'passed',
          message: 'Request is valid and would succeed',
        });
        return;
      }

      // Execute the actual operation
      const result = await Promise.resolve(executor(req, validated));
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
