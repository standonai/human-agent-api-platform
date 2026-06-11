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

export interface RefreshTokenPayload {
  userId: string;
  type: 'refresh';
  jti: string;
  iat: number;
  exp: number;
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
 * OAuth-style token payloads (Phase 3 delegation)
 *
 * Session tokens (login/refresh) have no `token_use`. Agent tokens are an
 * agent acting as itself; delegated tokens are an agent acting on behalf
 * of a user under a delegation grant (RFC 8693 `act` actor claim).
 */
export interface AgentTokenPayload {
  token_use: 'agent';
  sub: string; // agent id
  iat: number;
  exp: number;
}

export interface DelegatedTokenPayload {
  token_use: 'delegated';
  sub: string;                 // the delegating user — ownership flows from here
  act: { sub: string };        // the agent actually calling
  scope: string;               // space-delimited
  grant_id: string;
  iat: number;
  exp: number;
}

/**
 * Delegation context attached to a request authenticated with a
 * delegated token.
 */
export interface DelegationContext {
  grantId: string;
  userId: string;   // delegating user
  agentId: string;  // acting agent
  scopes: string[];
}

/**
 * Resource ownership tracking (OWASP API1 protection)
 */
export interface ResourceOwnership {
  createdBy: string;    // User/agent ID that created resource
  ownerId: string;      // Primary owner (defaults to createdBy)
  updatedBy?: string;   // Last modifier
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
      /** Set when authenticated with a delegated token (agent for user). */
      delegation?: DelegationContext;
      /** How this request authenticated: session (default), agent, delegated. */
      tokenUse?: 'session' | 'agent' | 'delegated';
    }
  }
}
