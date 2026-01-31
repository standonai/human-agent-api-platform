/**
 * Authentication Middleware
 *
 * Verifies JWT tokens and attaches user to request
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/jwt-utils.js';
import { ErrorCode } from '../types/errors.js';

/**
 * Require JWT authentication
 *
 * Usage:
 *   app.get('/api/protected', requireAuth, handler);
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // Check for Authorization header
  if (!authHeader) {
    res.status(401).json({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'MISSING_AUTHORIZATION_HEADER',
          message: 'No authorization header provided',
          suggestion: 'Include Authorization: Bearer <token> header in your request',
        }],
        doc_url: 'https://docs.example.com/auth',
      },
    });
    return;
  }

  // Check for Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid authorization format',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'INVALID_AUTHORIZATION_FORMAT',
          message: 'Authorization header must use Bearer scheme',
          suggestion: 'Use format: Authorization: Bearer <your-token>',
        }],
        doc_url: 'https://docs.example.com/auth',
      },
    });
    return;
  }

  // Extract token
  const token = authHeader.substring(7);

  try {
    // Verify token
    const payload = verifyToken(token);

    // Attach user to request
    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'TOKEN_EXPIRED') {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication token has expired',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'TOKEN_EXPIRED',
            message: 'Your session has expired',
            suggestion: 'Refresh your token using POST /api/auth/refresh or login again',
          }],
          doc_url: 'https://docs.example.com/auth/refresh',
        },
      });
      return;
    }

    if (errorMessage === 'INVALID_TOKEN') {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid authentication token',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'INVALID_TOKEN',
            message: 'Token is malformed or invalid',
            suggestion: 'Obtain a new token via POST /api/auth/login',
          }],
          doc_url: 'https://docs.example.com/auth/login',
        },
      });
      return;
    }

    // Generic token verification error
    res.status(401).json({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Token verification failed',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'TOKEN_VERIFICATION_FAILED',
          message: 'Could not verify authentication token',
          suggestion: 'Login again to obtain a new token',
        }],
      },
    });
  }
}

/**
 * Optional authentication (doesn't block if no token)
 *
 * Useful for endpoints that behave differently for authenticated users
 * but are also accessible anonymously
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without user
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    // Invalid token, but we don't fail - just continue without user
  }

  next();
}
