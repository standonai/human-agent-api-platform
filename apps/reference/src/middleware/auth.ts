/**
 * Authentication Middleware
 *
 * Verifies bearer tokens and attaches the principal to the request.
 * Three token kinds (see types/auth.ts):
 *   - session   — human login JWT: full authority over own resources
 *   - agent     — OAuth client_credentials: agent acting as itself
 *   - delegated — RFC 8693 token exchange: agent acting on behalf of a user
 *
 * Delegated tokens are validated against the live delegation grant on every
 * request, so revocation takes effect immediately. The effective principal
 * (req.user) is the delegating user with role pinned to viewer — role never
 * flows through delegation.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/jwt-utils.js';
import { findUserById } from '../auth/user-store.js';
import { findAgentById } from '../auth/agent-store.js';
import { findGrantById, touchGrantUsage } from '../auth/delegation-store.js';
import { trackAgentCall } from '@standonai/agent-metrics';
import { ErrorCode } from '../types/errors.js';
import { UserRole } from '../types/auth.js';
import { withDocUrl } from '../utils/docs-url.js';

/**
 * Point OAuth-capable clients (e.g. MCP) at the protected-resource
 * metadata, per the MCP authorization spec.
 */
export function setWwwAuthenticate(req: Request, res: Response): void {
  const host = typeof req.get === 'function' ? req.get('host') : req.headers?.host;
  const base = `${req.protocol || 'http'}://${host || 'localhost'}`;
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
  );
}

function sendAuthError(
  req: Request,
  res: Response,
  status: number,
  detail: { code: string; message: string; suggestion: string },
  docPath = '/auth'
): void {
  setWwwAuthenticate(req, res);
  res.status(status).json({
    error: {
      code: status === 403 ? ErrorCode.FORBIDDEN : ErrorCode.UNAUTHORIZED,
      message: detail.message,
      request_id: req.requestId || 'unknown',
      details: [detail],
      ...withDocUrl(docPath),
    },
  });
}

type AuthErrorCode =
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'TOKEN_VERIFICATION_FAILED'
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'AGENT_DEACTIVATED';

class AuthError extends Error {
  constructor(public readonly codeName: AuthErrorCode) {
    super(codeName);
  }
}

/**
 * Verify a bearer token and apply the resulting principal to the request.
 * Throws AuthError on any failure.
 */
function applyToken(req: Request, token: string): void {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TOKEN_VERIFICATION_FAILED';
    throw new AuthError(
      (['TOKEN_EXPIRED', 'INVALID_TOKEN'].includes(message)
        ? message
        : 'TOKEN_VERIFICATION_FAILED') as AuthErrorCode
    );
  }

  if (payload.token_use === 'agent') {
    const agent = findAgentById(payload.sub);
    if (!agent || !agent.active) {
      throw new AuthError('AGENT_DEACTIVATED');
    }
    req.tokenUse = 'agent';
    req.agent = { id: agent.id, name: agent.name };
    bindVerifiedAgent(req, agent.id);
    return;
  }

  if (payload.token_use === 'delegated') {
    const grant = findGrantById(payload.grant_id);
    if (!grant || grant.userId !== payload.sub || grant.agentId !== payload.act.sub) {
      throw new AuthError('INVALID_TOKEN');
    }
    if (grant.revokedAt) {
      throw new AuthError('GRANT_REVOKED');
    }
    if (grant.expiresAt.getTime() <= Date.now()) {
      throw new AuthError('GRANT_EXPIRED');
    }
    const agent = findAgentById(grant.agentId);
    if (!agent || !agent.active) {
      throw new AuthError('AGENT_DEACTIVATED');
    }
    const user = findUserById(grant.userId);
    if (!user) {
      throw new AuthError('INVALID_TOKEN');
    }

    touchGrantUsage(grant.id);

    req.tokenUse = 'delegated';
    // Effective principal: the delegating user. Role is pinned to viewer —
    // delegation conveys resource ownership, never role.
    req.user = { id: user.id, email: user.email, role: UserRole.VIEWER };
    req.agent = { id: agent.id, name: agent.name };
    req.delegation = {
      grantId: grant.id,
      userId: grant.userId,
      agentId: grant.agentId,
      scopes: grant.scopes,
    };
    bindVerifiedAgent(req, agent.id);
    return;
  }

  // Session token (human login)
  req.tokenUse = 'session';
  req.user = {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
  };
}

/**
 * Bind the zero-shot metric and rate limiting to the *authenticated*
 * agent identity rather than self-reported headers.
 */
function bindVerifiedAgent(req: Request, agentId: string): void {
  (req as any).agentContext = {
    ...(req as any).agentContext,
    identification: { agentId, agentType: 'authenticated' },
  };
  trackAgentCall(agentId, req.path);
}

const AUTH_ERROR_RESPONSES: Record<AuthErrorCode, { status: number; message: string; suggestion: string; doc: string }> = {
  TOKEN_EXPIRED: {
    status: 401,
    message: 'Authentication token has expired',
    suggestion: 'Refresh your token (POST /api/auth/refresh) or re-exchange at POST /oauth/token',
    doc: '/auth/refresh',
  },
  INVALID_TOKEN: {
    status: 401,
    message: 'Invalid authentication token',
    suggestion: 'Obtain a new token via POST /api/auth/login or POST /oauth/token',
    doc: '/auth/login',
  },
  TOKEN_VERIFICATION_FAILED: {
    status: 401,
    message: 'Token verification failed',
    suggestion: 'Login again to obtain a new token',
    doc: '/auth',
  },
  GRANT_REVOKED: {
    status: 401,
    message: 'Delegation grant has been revoked',
    suggestion: 'Ask the user to create a new delegation grant (POST /api/delegations)',
    doc: '/delegations',
  },
  GRANT_EXPIRED: {
    status: 401,
    message: 'Delegation grant has expired',
    suggestion: 'Ask the user to create a new delegation grant (POST /api/delegations)',
    doc: '/delegations',
  },
  AGENT_DEACTIVATED: {
    status: 403,
    message: 'Agent has been deactivated',
    suggestion: 'Contact an administrator to reactivate the agent',
    doc: '/agents/auth',
  },
};

function respondAuthError(req: Request, res: Response, error: AuthError): void {
  const spec = AUTH_ERROR_RESPONSES[error.codeName];
  sendAuthError(
    req,
    res,
    spec.status,
    { code: error.codeName, message: spec.message, suggestion: spec.suggestion },
    spec.doc
  );
}

/**
 * Require bearer authentication that yields a *user* principal
 * (session or delegated). Agent tokens are rejected with guidance.
 *
 * Usage:
 *   app.get('/api/protected', requireAuth, handler);
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    sendAuthError(req, res, 401, {
      code: 'MISSING_AUTHORIZATION_HEADER',
      message: 'No authorization header provided',
      suggestion: 'Include Authorization: Bearer <token> header in your request',
    });
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    sendAuthError(req, res, 401, {
      code: 'INVALID_AUTHORIZATION_FORMAT',
      message: 'Authorization header must use Bearer scheme',
      suggestion: 'Use format: Authorization: Bearer <your-token>',
    });
    return;
  }

  try {
    applyToken(req, authHeader.substring(7));
  } catch (error) {
    if (error instanceof AuthError) {
      respondAuthError(req, res, error);
      return;
    }
    throw error;
  }

  if (!req.user) {
    sendAuthError(req, res, 403, {
      code: 'USER_PRINCIPAL_REQUIRED',
      message: 'This endpoint requires a user principal',
      suggestion:
        'Agent tokens act as the agent only. Exchange for a delegated token ' +
        '(POST /oauth/token, grant_type=token-exchange) to act on behalf of a user',
    });
    return;
  }

  next();
}

/**
 * Require a human session token specifically (not delegated, not agent).
 * Used where consent is established or modified — an agent must never be
 * able to mint or extend its own authority.
 */
export function requireSessionAuth(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.tokenUse !== 'session') {
      sendAuthError(req, res, 403, {
        code: 'SESSION_REQUIRED',
        message: 'This endpoint requires a human session token',
        suggestion: 'Delegation grants can only be managed by the user (login via POST /api/auth/login)',
      }, '/delegations');
      return;
    }
    next();
  });
}

/**
 * Optional authentication (doesn't block if no token)
 *
 * A missing or garbage token continues anonymously. A *valid* delegated
 * token whose grant is revoked/expired fails loudly instead — the caller
 * clearly intended to authenticate and must learn why it failed.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    applyToken(req, authHeader.substring(7));
  } catch (error) {
    if (
      error instanceof AuthError &&
      ['GRANT_REVOKED', 'GRANT_EXPIRED', 'AGENT_DEACTIVATED'].includes(error.codeName)
    ) {
      respondAuthError(req, res, error);
      return;
    }
    // Garbage/expired token: continue without principal (route decides).
  }

  next();
}
