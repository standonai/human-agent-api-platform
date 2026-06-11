/**
 * Authentication Routes
 *
 * Handles user registration, login, token refresh
 */

import { Router, Request, Response } from 'express';
import { ErrorCode } from '../types/errors.js';
import { ApiError } from '../middleware/error-handler.js';
import { UserRole } from '../types/auth.js';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  updateLastLogin,
  toUserResponse,
  findUserById,
} from '../auth/user-store.js';
import {
  generateTokenPairWithMetadata,
  verifyRefreshToken,
} from '../auth/jwt-utils.js';
import { requireAuth } from '../middleware/auth.js';
import {
  isRefreshTokenSessionActive,
  revokeRefreshTokenSession,
  storeRefreshTokenSession,
  revokeAllUserRefreshTokenSessions,
} from '../auth/refresh-token-store.js';
import {
  isLoginAttemptAllowed,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from '../auth/login-attempt-guard.js';
import { AuditEvent, logSecurityEvent } from '../observability/audit-logger.js';

const router = Router();

function escalateRefreshTokenReuse(req: Request, userId: string, jti: string): void {
  revokeAllUserRefreshTokenSessions(userId);
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  logSecurityEvent(AuditEvent.TOKEN_REUSE_DETECTED, {
    ip: clientIp,
    userId,
    path: req.path,
    description: 'Refresh token reuse detected; all sessions revoked',
    metadata: { refreshTokenId: jti },
  });
}

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const { email, password, name, role } = req.body;

    // Validation
    if (!email || !password || !name) {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Email, password, and name are required',
        undefined,
        [{
          code: 'MISSING_FIELDS',
          message: 'Required fields missing',
          suggestion: 'Provide email, password, and name in request body',
        }]
      );
    }

    // Email format validation
    if (!email.includes('@')) {
      throw new ApiError(
        400,
        ErrorCode.INVALID_FORMAT,
        'Invalid email format',
        'email',
        [{
          code: 'INVALID_EMAIL',
          message: 'Email must be a valid email address',
          suggestion: 'Use format: user@example.com',
        }]
      );
    }

    // Password strength validation
    if (password.length < 8) {
      throw new ApiError(
        400,
        ErrorCode.INVALID_PARAMETER,
        'Password too weak',
        'password',
        [{
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters',
          suggestion: 'Use a password with at least 8 characters',
        }]
      );
    }

    // Role validation (if provided)
    const userRole = role || UserRole.VIEWER;
    if (!Object.values(UserRole).includes(userRole)) {
      throw new ApiError(
        400,
        ErrorCode.INVALID_PARAMETER,
        'Invalid role',
        'role',
        [{
          code: 'INVALID_ROLE',
          message: `Role must be one of: ${Object.values(UserRole).join(', ')}`,
          suggestion: 'Use a valid role: admin, developer, or viewer',
        }]
      );
    }

    // Create user
    try {
      const user = await createUser(email, password, name, userRole);

      // Generate tokens
      const { tokens, refreshTokenId, refreshTokenExpiresAt } = generateTokenPairWithMetadata(user);
      storeRefreshTokenSession(refreshTokenId, user.id, refreshTokenExpiresAt);

      res.status(201).json({
        data: {
          user: toUserResponse(user),
          ...tokens,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new ApiError(
          409,
          ErrorCode.CONFLICT,
          'User already exists',
          'email',
          [{
            code: 'DUPLICATE_EMAIL',
            message: 'A user with this email already exists',
            suggestion: 'Use a different email or login to existing account',
          }]
        );
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Validation
    if (!email || !password) {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Email and password are required',
        undefined,
        [{
          code: 'MISSING_CREDENTIALS',
          message: 'Both email and password must be provided',
          suggestion: 'Include email and password in request body',
        }]
      );
    }

    const loginAllowed = await isLoginAttemptAllowed(clientIp, email);
    if (!loginAllowed.allowed) {
      const retryAfterSeconds = loginAllowed.retryAfterSeconds || 60;
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      throw new ApiError(
        429,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Too many failed login attempts. Try again later.',
        'email',
        [{
          code: 'LOGIN_TEMPORARILY_LOCKED',
          message: 'Account or IP temporarily locked due to repeated failed logins',
          suggestion: `Wait ${retryAfterSeconds} seconds before trying again`,
        }]
      );
    }

    // Find user
    const user = findUserByEmail(email);
    if (!user) {
      const lockout = await recordFailedLoginAttempt(clientIp, email);
      logSecurityEvent(AuditEvent.USER_LOGIN_FAILED, {
        ip: clientIp,
        path: req.path,
        description: `Failed login attempt for unknown user ${email}`,
      });
      if (lockout.locked) {
        const retryAfterSeconds = lockout.retryAfterSeconds || 60;
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        throw new ApiError(
          429,
          ErrorCode.RATE_LIMIT_EXCEEDED,
          'Too many failed login attempts. Try again later.',
          'email',
          [{
            code: 'LOGIN_TEMPORARILY_LOCKED',
            message: 'Account or IP temporarily locked due to repeated failed logins',
            suggestion: `Wait ${retryAfterSeconds} seconds before trying again`,
          }]
        );
      }

      // Don't reveal whether user exists (security best practice)
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Invalid credentials',
        undefined,
        [{
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
          suggestion: 'Check your email and password and try again',
        }]
      );
    }

    // Verify password
    const isValid = await verifyPassword(user, password);
    if (!isValid) {
      const lockout = await recordFailedLoginAttempt(clientIp, email);
      if (lockout.locked) {
        const retryAfterSeconds = lockout.retryAfterSeconds || 60;
        res.setHeader('Retry-After', retryAfterSeconds.toString());
      }
      logSecurityEvent(AuditEvent.USER_LOGIN_FAILED, {
        ip: clientIp,
        userId: user.id,
        path: req.path,
        description: `Failed login attempt for ${email}`,
      });

      if (lockout.locked) {
        throw new ApiError(
          429,
          ErrorCode.RATE_LIMIT_EXCEEDED,
          'Too many failed login attempts. Try again later.',
          'email',
          [{
            code: 'LOGIN_TEMPORARILY_LOCKED',
            message: 'Account or IP temporarily locked due to repeated failed logins',
            suggestion: `Wait ${lockout.retryAfterSeconds || 60} seconds before trying again`,
          }]
        );
      }

      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Invalid credentials',
        undefined,
        [{
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
          suggestion: 'Check your email and password and try again',
        }]
      );
    }

    // Update last login
    updateLastLogin(user.id);
    await clearFailedLoginAttempts(clientIp, email);

    // Generate tokens
    const { tokens, refreshTokenId, refreshTokenExpiresAt } = generateTokenPairWithMetadata(user);
    storeRefreshTokenSession(refreshTokenId, user.id, refreshTokenExpiresAt);

    res.status(200).json({
      data: {
        user: toUserResponse(user),
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Refresh token is required',
        'refreshToken',
        [{
          code: 'MISSING_REFRESH_TOKEN',
          message: 'No refresh token provided',
          suggestion: 'Include refreshToken in request body',
        }]
      );
    }

    // Verify refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage === 'REFRESH_TOKEN_EXPIRED') {
        throw new ApiError(
          401,
          ErrorCode.UNAUTHORIZED,
          'Refresh token expired',
          'refreshToken',
          [{
            code: 'REFRESH_TOKEN_EXPIRED',
            message: 'Your refresh token has expired',
            suggestion: 'Login again to get a new refresh token',
          }]
        );
      }

      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Invalid refresh token',
        'refreshToken',
        [{
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or malformed',
          suggestion: 'Login again to get a valid refresh token',
        }]
      );
    }

    // Check refresh token revocation/rotation state
    if (!isRefreshTokenSessionActive(payload.jti)) {
      escalateRefreshTokenReuse(req, payload.userId, payload.jti);
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Refresh token is no longer valid',
        'refreshToken',
        [{
          code: 'REFRESH_TOKEN_REVOKED',
          message: 'Refresh token was revoked or already used',
          suggestion: 'Login again to establish a new session',
        }]
      );
    }

    // Find user
    const user = findUserById(payload.userId);
    if (!user) {
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'User not found',
        undefined,
        [{
          code: 'USER_NOT_FOUND',
          message: 'User associated with this token no longer exists',
          suggestion: 'Register a new account or contact support',
        }]
      );
    }

    // Generate new token pair and rotate refresh session
    const { tokens, refreshTokenId, refreshTokenExpiresAt } = generateTokenPairWithMetadata(user);
    storeRefreshTokenSession(refreshTokenId, user.id, refreshTokenExpiresAt);
    const rotated = revokeRefreshTokenSession(payload.jti, refreshTokenId);
    if (!rotated) {
      // Defensive cleanup for concurrent refresh replay attempts.
      revokeRefreshTokenSession(refreshTokenId);
      escalateRefreshTokenReuse(req, payload.userId, payload.jti);
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Refresh token is no longer valid',
        'refreshToken',
        [{
          code: 'REFRESH_TOKEN_REPLAYED',
          message: 'Refresh token was already used',
          suggestion: 'Login again to establish a new session',
        }]
      );
    }

    res.status(200).json({
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.user!.id);

  if (!user) {
    res.status(404).json({
      error: {
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: 'User not found',
        request_id: req.requestId || 'unknown',
      },
    });
    return;
  }

  res.status(200).json({
    data: toUserResponse(user),
  });
});

/**
 * POST /api/auth/logout
 * Logout and revoke refresh token session
 */
router.post('/logout', requireAuth, (req: Request, res: Response, next) => {
  try {
    const { refreshToken } = req.body || {};

    if (!refreshToken) {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Refresh token is required for logout',
        'refreshToken',
        [{
          code: 'MISSING_REFRESH_TOKEN',
          message: 'No refresh token provided',
          suggestion: 'Include refreshToken in request body to revoke the session',
        }]
      );
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Invalid refresh token',
        'refreshToken',
        [{
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or malformed',
          suggestion: 'Login again and use the latest refresh token',
        }]
      );
    }

    if (payload.userId !== req.user!.id) {
      throw new ApiError(
        403,
        ErrorCode.FORBIDDEN,
        'Refresh token does not belong to authenticated user',
        'refreshToken',
        [{
          code: 'TOKEN_USER_MISMATCH',
          message: 'Cannot revoke another user\'s session token',
          suggestion: 'Use the refresh token issued for the current account',
        }]
      );
    }

    revokeRefreshTokenSession(payload.jti);

    res.status(200).json({
      data: {
        message: 'Logged out successfully',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout-all
 * Revoke all refresh token sessions for authenticated user
 */
router.post('/logout-all', requireAuth, (req: Request, res: Response) => {
  const revokedCount = revokeAllUserRefreshTokenSessions(req.user!.id);
  res.status(200).json({
    data: {
      message: 'All sessions revoked successfully',
      revokedSessions: revokedCount,
    },
  });
});

export default router;
