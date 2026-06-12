/**
 * Scope enforcement for delegated tokens.
 *
 * Sessions keep full authority over their own resources (humans are not
 * scoped down). Agent tokens act as the agent itself and are bounded by
 * ownership. Delegated tokens carry the grant's scopes and must cover the
 * action.
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '@standonai/agent-errors/errors';
import { withDocUrl } from '@standonai/agent-errors/docs-url';

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.delegation) {
      next();
      return;
    }

    if (req.delegation.scopes.includes(scope)) {
      next();
      return;
    }

    res.status(403).json({
      error: {
        code: ErrorCode.FORBIDDEN,
        message: `Delegation grant does not include the '${scope}' scope`,
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'INSUFFICIENT_SCOPE',
          message: `This action requires the '${scope}' scope; the grant allows: ${req.delegation.scopes.join(', ')}`,
          suggestion: `Ask the user to create a delegation grant including '${scope}' (POST /api/delegations)`,
        }],
        ...withDocUrl('/delegations'),
      },
    });
  };
}
