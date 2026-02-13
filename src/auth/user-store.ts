/**
 * User Store (SQLite via Drizzle ORM)
 *
 * All function signatures unchanged — better-sqlite3 is synchronous,
 * so findUserByEmail, findUserById, updateLastLogin stay non-async.
 */

import { eq, sql } from 'drizzle-orm';
import { User, UserRole, UserResponse } from '../types/auth.js';
import { getDb, usersTable, DbUser } from '../db/database.js';
import bcrypt from 'bcryptjs';

// ─── ID counter (lazily seeded from DB) ──────────────────────────────────────

let _userCounter: number | null = null;

function nextUserId(): string {
  if (_userCounter === null) {
    const row = getDb()
      .select({ maxNum: sql<number | null>`MAX(CAST(SUBSTR(id, 6) AS INTEGER))` })
      .from(usersTable)
      .get();
    _userCounter = (row?.maxNum ?? 0) + 1;
  }
  return `user_${_userCounter++}`;
}

// ─── Row → domain object ──────────────────────────────────────────────────────

function rowToUser(row: DbUser): User {
  return {
    id:           row.id,
    email:        row.email,
    name:         row.name,
    role:         row.role as UserRole,
    passwordHash: row.passwordHash,
    createdAt:    row.createdAt as Date,
    updatedAt:    row.updatedAt as Date,
    lastLoginAt:  row.lastLoginAt as Date | undefined ?? undefined,
  };
}

// ─── Public API (signatures unchanged) ───────────────────────────────────────

/**
 * Create a new user
 */
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: UserRole = UserRole.VIEWER
): Promise<User> {
  const existing = findUserByEmail(email);
  if (existing) throw new Error('User with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);

  const user: User = {
    id:           nextUserId(),
    email:        email.toLowerCase(),
    name,
    role,
    passwordHash,
    createdAt:    new Date(),
    updatedAt:    new Date(),
  };

  getDb().insert(usersTable).values({
    id:           user.id,
    email:        user.email,
    name:         user.name,
    role:         user.role,
    passwordHash: user.passwordHash,
    createdAt:    user.createdAt,
    updatedAt:    user.updatedAt,
    lastLoginAt:  null,
  }).run();

  return user;
}

/**
 * Find user by email
 */
export function findUserByEmail(email: string): User | undefined {
  const row = getDb()
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .get();
  return row ? rowToUser(row) : undefined;
}

/**
 * Find user by ID
 */
export function findUserById(id: string): User | undefined {
  const row = getDb().select().from(usersTable).where(eq(usersTable.id, id)).get();
  return row ? rowToUser(row) : undefined;
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
  const now = new Date();
  getDb()
    .update(usersTable)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(usersTable.id, userId))
    .run();
}

/**
 * Convert User to UserResponse (remove sensitive fields)
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id:          user.id,
    email:       user.email,
    name:        user.name,
    role:        user.role,
    createdAt:   user.createdAt,
    updatedAt:   user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

/**
 * Get all users (admin only)
 */
export function getAllUsers(): UserResponse[] {
  const rows = getDb().select().from(usersTable).all();
  return rows.map(row => toUserResponse(rowToUser(row)));
}

/**
 * Delete user (admin only)
 */
export function deleteUser(userId: string): boolean {
  const result = getDb().delete(usersTable).where(eq(usersTable.id, userId)).run();
  return result.changes > 0;
}

/**
 * Initialize with a default admin user for testing.
 * Guarded: skips if any user already exists.
 */
export async function initializeDefaultUsers(): Promise<void> {
  const countRow = getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(usersTable)
    .get();

  if ((countRow?.count ?? 0) > 0) return;

  await createUser('admin@example.com', 'admin123', 'Admin User', UserRole.ADMIN);

  console.log('📝 Default admin user created:');
  console.log('   Email: admin@example.com');
  console.log('   Password: admin123');
  console.log('   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
}
