/**
 * Authentication & Authorization Types
 */

/**
 * User roles with different permission levels
 */
export enum UserRole {
  ADMIN = 'admin',       // Full access to everything
  DEVELOPER = 'developer', // Can create/read/update (no delete)
  VIEWER = 'viewer',      // Read-only access
}

/**
 * User entity
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;  // Never expose this in API responses
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

/**
 * User data safe for API responses (no sensitive fields)
 */
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

/**
 * JWT Token Payload
 */
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;  // Issued at
  exp: number;  // Expiration
}

/**
 * JWT Token Pair
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration data
 */
export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: UserRole; // Optional, defaults to VIEWER
}

/**
 * Refresh token request
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * Extended Express Request with authenticated user
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
      agent?: {
        id: string;
        name?: string;
      };
    }
  }
}
