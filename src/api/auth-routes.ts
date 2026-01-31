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
  generateTokenPair,
  verifyRefreshToken,
} from '../auth/jwt-utils.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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
      const tokens = generateTokenPair(user);

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

    // Find user
    const user = findUserByEmail(email);
    if (!user) {
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

    // Generate tokens
    const tokens = generateTokenPair(user);

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

    // Generate new token pair
    const tokens = generateTokenPair(user);

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
 * Logout (client-side token deletion)
 *
 * Note: Since we're using stateless JWT, logout is primarily client-side.
 * In production, implement token blacklisting for immediate revocation.
 */
router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({
    data: {
      message: 'Logged out successfully',
      suggestion: 'Delete your access and refresh tokens from client storage',
    },
  });
});

export default router;
