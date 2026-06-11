import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { initializeDatabase, getDb, refreshTokensTable } from '../db/database.js';
import { and, eq, isNull } from 'drizzle-orm';
import {
  deleteExpiredRefreshTokenSessions,
  isRefreshTokenSessionActive,
  revokeAllUserRefreshTokenSessions,
  revokeRefreshTokenSession,
  startRefreshTokenSessionCleanup,
  stopRefreshTokenSessionCleanup,
  storeRefreshTokenSession,
} from './refresh-token-store.js';

const tmpDir = path.join('/tmp', `refresh-token-test-${randomBytes(4).toString('hex')}`);
const dbPath = path.join(tmpDir, 'test.db');

describe('refresh-token-store', () => {
  const originalMaxSessions = process.env.REFRESH_TOKEN_MAX_ACTIVE_SESSIONS;

  beforeAll(async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.DATABASE_URL = dbPath;
    await initializeDatabase();
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    delete process.env.DATABASE_URL;
    process.env.REFRESH_TOKEN_MAX_ACTIVE_SESSIONS = originalMaxSessions;
  });

  beforeEach(() => {
    getDb().delete(refreshTokensTable).run();
    process.env.REFRESH_TOKEN_MAX_ACTIVE_SESSIONS = '5';
  });

  it('stores and validates active refresh sessions', () => {
    const expiresAt = new Date(Date.now() + 60_000);
    storeRefreshTokenSession('jti_1', 'user_1', expiresAt);

    expect(isRefreshTokenSessionActive('jti_1')).toBe(true);
  });

  it('revokes a refresh session', () => {
    const expiresAt = new Date(Date.now() + 60_000);
    storeRefreshTokenSession('jti_2', 'user_1', expiresAt);

    expect(revokeRefreshTokenSession('jti_2')).toBe(true);
    expect(revokeRefreshTokenSession('jti_2')).toBe(false);
    expect(isRefreshTokenSessionActive('jti_2')).toBe(false);
  });

  it('revokes all user sessions', () => {
    const expiresAt = new Date(Date.now() + 60_000);
    storeRefreshTokenSession('jti_3', 'user_1', expiresAt);
    storeRefreshTokenSession('jti_4', 'user_1', expiresAt);
    storeRefreshTokenSession('jti_5', 'user_2', expiresAt);

    const revoked = revokeAllUserRefreshTokenSessions('user_1');
    expect(revoked).toBe(2);
    expect(isRefreshTokenSessionActive('jti_3')).toBe(false);
    expect(isRefreshTokenSessionActive('jti_4')).toBe(false);
    expect(isRefreshTokenSessionActive('jti_5')).toBe(true);
  });

  it('deletes expired sessions', () => {
    storeRefreshTokenSession('jti_old', 'user_1', new Date(Date.now() - 1_000));
    storeRefreshTokenSession('jti_new', 'user_1', new Date(Date.now() + 60_000));

    const deleted = deleteExpiredRefreshTokenSessions();
    expect(deleted).toBe(1);
    expect(isRefreshTokenSessionActive('jti_old')).toBe(false);
    expect(isRefreshTokenSessionActive('jti_new')).toBe(true);
  });

  it('starts and stops cleanup scheduler idempotently', () => {
    startRefreshTokenSessionCleanup(10);
    startRefreshTokenSessionCleanup(10);
    stopRefreshTokenSessionCleanup();
    stopRefreshTokenSessionCleanup();

    expect(true).toBe(true);
  });

  it('enforces max active sessions per user by revoking oldest sessions', () => {
    process.env.REFRESH_TOKEN_MAX_ACTIVE_SESSIONS = '2';
    const expiresAt = new Date(Date.now() + 60_000);

    storeRefreshTokenSession('jti_cap_1', 'user_cap', expiresAt);
    storeRefreshTokenSession('jti_cap_2', 'user_cap', expiresAt);
    storeRefreshTokenSession('jti_cap_3', 'user_cap', expiresAt);

    const active = getDb()
      .select({ jti: refreshTokensTable.jti })
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.userId, 'user_cap'),
          isNull(refreshTokensTable.revokedAt)
        )
      )
      .all()
      .map((row) => row.jti)
      .sort();

    expect(active).toEqual(['jti_cap_2', 'jti_cap_3']);
    expect(isRefreshTokenSessionActive('jti_cap_1')).toBe(false);
    expect(isRefreshTokenSessionActive('jti_cap_2')).toBe(true);
    expect(isRefreshTokenSessionActive('jti_cap_3')).toBe(true);
  });
});
