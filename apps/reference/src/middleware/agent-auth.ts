/**
 * Cross-principal auth gate.
 *
 * Agents authenticate with Bearer tokens from POST /oauth/token
 * (client_credentials or token exchange) — the same Authorization header
 * humans use. Direct X-Agent-Key header auth on data routes was removed
 * after its Phase 3 deprecation window; the agent id/key pair remains the
 * credential *for the token endpoint only*.
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '@standonai/agent-errors/errors';
import { withDocUrl } from '@standonai/agent-errors/docs-url';

/**
 * Require either a user or an agent principal (set by optionalAuth from a
 * session, delegated, or agent bearer token).
 */
export function requireUserOrAgent(req: Request, res: Response, next: NextFunction): void {
  if (req.user || req.agent) {
    next();
    return;
  }

  res.status(401).json({
    error: {
      code: ErrorCode.UNAUTHORIZED,
      message: 'Authentication required',
      request_id: req.requestId || 'unknown',
      details: [{
        code: 'AUTHENTICATION_REQUIRED',
        message: 'This endpoint requires a user or agent bearer token',
        suggestion:
          'Login (POST /api/auth/login) for a session token, or exchange agent ' +
          'credentials at POST /oauth/token, then send Authorization: Bearer <token>',
      }],
      ...withDocUrl('/auth'),
    },
  });
}
