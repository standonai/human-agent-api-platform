import { and, asc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { getDb, refreshTokensTable } from '../db/database.js';

export interface RefreshTokenSession {
  jti: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
  replacedByJti?: string;
}

let cleanupTimer: NodeJS.Timeout | null = null;

function getMaxActiveSessionsPerUser(): number {
  const configured = parseInt(process.env.REFRESH_TOKEN_MAX_ACTIVE_SESSIONS || '5', 10);
  if (Number.isNaN(configured) || configured <= 0) {
    return 5;
  }
  return configured;
}

function enforceActiveSessionLimit(userId: string): void {
  const maxSessions = getMaxActiveSessionsPerUser();
  const now = new Date();
  const activeSessions = getDb()
    .select({
      jti: refreshTokensTable.jti,
      createdAt: refreshTokensTable.createdAt,
    })
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.userId, userId),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, now)
      )
    )
    .orderBy(asc(refreshTokensTable.createdAt), asc(refreshTokensTable.jti))
    .all();

  if (activeSessions.length <= maxSessions) {
    return;
  }

  const overflow = activeSessions
    .slice(0, activeSessions.length - maxSessions)
    .map((session) => session.jti);

  if (overflow.length === 0) {
    return;
  }

  getDb()
    .update(refreshTokensTable)
    .set({ revokedAt: now })
    .where(
      and(
        isNull(refreshTokensTable.revokedAt),
        inArray(refreshTokensTable.jti, overflow)
      )
    )
    .run();
}

export function storeRefreshTokenSession(
  jti: string,
  userId: string,
  expiresAt: Date
): void {
  getDb()
    .insert(refreshTokensTable)
    .values({
      jti,
      userId,
      expiresAt,
      createdAt: new Date(),
      revokedAt: null,
      replacedByJti: null,
    })
    .run();

  enforceActiveSessionLimit(userId);
}

export function isRefreshTokenSessionActive(jti: string): boolean {
  const now = new Date();
  const row = getDb()
    .select({ jti: refreshTokensTable.jti })
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.jti, jti),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, now)
      )
    )
    .get();

  return Boolean(row);
}

export function revokeRefreshTokenSession(jti: string, replacedByJti?: string): boolean {
  const result = getDb()
    .update(refreshTokensTable)
    .set({
      revokedAt: new Date(),
      replacedByJti: replacedByJti ?? null,
    })
    .where(and(eq(refreshTokensTable.jti, jti), isNull(refreshTokensTable.revokedAt)))
    .run();

  return result.changes > 0;
}

export function revokeAllUserRefreshTokenSessions(userId: string): number {
  const result = getDb()
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokensTable.userId, userId), isNull(refreshTokensTable.revokedAt)))
    .run();

  return result.changes;
}

export function deleteExpiredRefreshTokenSessions(): number {
  const result = getDb()
    .delete(refreshTokensTable)
    .where(lte(refreshTokensTable.expiresAt, new Date()))
    .run();

  return result.changes;
}

export function startRefreshTokenSessionCleanup(intervalMs: number): void {
  if (cleanupTimer) {
    return;
  }

  // Cleanup once at startup, then periodically.
  try {
    deleteExpiredRefreshTokenSessions();
  } catch (error) {
    console.warn(
      '⚠️  Failed to cleanup expired refresh token sessions at startup:',
      (error as Error).message
    );
  }

  cleanupTimer = setInterval(() => {
    try {
      deleteExpiredRefreshTokenSessions();
    } catch (error) {
      console.warn(
        '⚠️  Failed to cleanup expired refresh token sessions:',
        (error as Error).message
      );
    }
  }, intervalMs);

  cleanupTimer.unref();
}

export function stopRefreshTokenSessionCleanup(): void {
  if (!cleanupTimer) {
    return;
  }

  clearInterval(cleanupTimer);
  cleanupTimer = null;
}
