/**
 * User Store (In-Memory)
 *
 * ⚠️ In production, replace with a real database (PostgreSQL, MongoDB, etc.)
 * This is for demonstration purposes only.
 */

import { User, UserRole, UserResponse } from '../types/auth.js';
import bcrypt from 'bcryptjs';

/**
 * In-memory user database
 * Replace with PostgreSQL/MongoDB in production
 */
const users = new Map<string, User>();
let userCounter = 1;

/**
 * Create a new user
 */
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: UserRole = UserRole.VIEWER
): Promise<User> {
  // Check if user already exists
  const existing = findUserByEmail(email);
  if (existing) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const user: User = {
    id: `user_${userCounter++}`,
    email: email.toLowerCase(),
    name,
    role,
    passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  users.set(user.id, user);

  return user;
}

/**
 * Find user by email
 */
export function findUserByEmail(email: string): User | undefined {
  const normalizedEmail = email.toLowerCase();
  return Array.from(users.values()).find(u => u.email === normalizedEmail);
}

/**
 * Find user by ID
 */
export function findUserById(id: string): User | undefined {
  return users.get(id);
}

/**
 * Verify user password
 */
export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

/**
 * Update user last login timestamp
 */
export function updateLastLogin(userId: string): void {
  const user = users.get(userId);
  if (user) {
    user.lastLoginAt = new Date();
    user.updatedAt = new Date();
  }
}

/**
 * Convert User to UserResponse (remove sensitive fields)
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

/**
 * Get all users (admin only)
 */
export function getAllUsers(): UserResponse[] {
  return Array.from(users.values()).map(toUserResponse);
}

/**
 * Delete user (admin only)
 */
export function deleteUser(userId: string): boolean {
  return users.delete(userId);
}

/**
 * Initialize with a default admin user for testing
 */
export async function initializeDefaultUsers(): Promise<void> {
  if (users.size === 0) {
    // Create default admin user
    // ⚠️ REMOVE THIS IN PRODUCTION!
    await createUser(
      'admin@example.com',
      'admin123', // ⚠️ Change this password!
      'Admin User',
      UserRole.ADMIN
    );

    console.log('📝 Default admin user created:');
    console.log('   Email: admin@example.com');
    console.log('   Password: admin123');
    console.log('   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
  }
}
