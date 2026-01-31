/**
 * JWT Utilities
 *
 * Handles JWT token generation, verification, and refresh
 */

import jwt from 'jsonwebtoken';
import { JWTPayload, TokenPair, User } from '../types/auth.js';

/**
 * Get JWT secret from environment
 * ⚠️ MUST be set in production!
 */
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production!');
    }
    // Development fallback (⚠️ NOT SECURE)
    console.warn('⚠️  WARNING: Using default JWT_SECRET in development. Set JWT_SECRET in .env!');
    return 'dev-secret-change-me-in-production';
  }

  return secret;
}

/**
 * Get JWT expiration time from environment
 */
function getJWTExpiration(): string {
  return process.env.JWT_EXPIRATION || '1h'; // Default: 1 hour
}

/**
 * Get refresh token expiration time from environment
 */
function getRefreshExpiration(): string {
  return process.env.JWT_REFRESH_EXPIRATION || '7d'; // Default: 7 days
}

/**
 * Generate JWT access token
 */
export function generateAccessToken(user: User): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload as object, getJWTSecret(), {
    expiresIn: getJWTExpiration() as string | number,
  } as jwt.SignOptions);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(user: User): string {
  const payload = {
    userId: user.id,
    type: 'refresh',
  };

  return jwt.sign(payload as object, getJWTSecret(), {
    expiresIn: getRefreshExpiration() as string | number,
  } as jwt.SignOptions);
}

/**
 * Generate token pair (access + refresh)
 */
export function generateTokenPair(user: User): TokenPair {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Get expiration time in seconds
  const expiresIn = parseExpirationToSeconds(getJWTExpiration());

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, getJWTSecret()) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_TOKEN');
    }
    throw new Error('TOKEN_VERIFICATION_FAILED');
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { userId: string; type: string } {
  try {
    const payload = jwt.verify(token, getJWTSecret()) as any;

    if (payload.type !== 'refresh') {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }
    throw new Error('REFRESH_TOKEN_VERIFICATION_FAILED');
  }
}

/**
 * Parse expiration string to seconds
 */
function parseExpirationToSeconds(expiration: string): number {
  const match = expiration.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 3600; // Default: 1 hour
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 3600;
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
