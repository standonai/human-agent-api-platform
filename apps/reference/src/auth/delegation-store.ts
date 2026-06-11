/**
 * Delegation Grant Store (SQLite via Drizzle ORM)
 *
 * A grant is the consent record behind delegated authority: user X allows
 * agent Y to act with these scopes until this time, revocable at any moment.
 * Token issuance and per-request validation both resolve grants here, which
 * is what makes revocation immediate.
 */

import { eq, sql } from 'drizzle-orm';
import { getDb, delegationGrantsTable, DbDelegationGrant } from '../db/database.js';

export const VALID_SCOPES = ['tasks:read', 'tasks:write', 'profile:read'] as const;
export type DelegationScope = (typeof VALID_SCOPES)[number];

export interface DelegationGrant {
  id: string;
  userId: string;
  agentId: string;
  scopes: string[];
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  lastUsedAt?: Date;
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;        // 24h
const MAX_TTL_SECONDS_FALLBACK = 7 * 24 * 60 * 60; // 7d

export function defaultGrantTtlSeconds(): number {
  const raw = parseInt(process.env.DELEGATION_DEFAULT_TTL_SECONDS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

export function maxGrantTtlSeconds(): number {
  const raw = parseInt(process.env.DELEGATION_MAX_TTL_SECONDS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : MAX_TTL_SECONDS_FALLBACK;
}

let _grantCounter: number | null = null;

function nextGrantId(): string {
  if (_grantCounter === null) {
    const row = getDb()
      .select({ maxNum: sql<number | null>`MAX(CAST(SUBSTR(id, 7) AS INTEGER))` })
      .from(delegationGrantsTable)
      .get();
    _grantCounter = (row?.maxNum ?? 0) + 1;
  }
  return `grant_${_grantCounter++}`;
}

function rowToGrant(row: DbDelegationGrant): DelegationGrant {
  return {
    id: row.id,
    userId: row.userId,
    agentId: row.agentId,
    scopes: JSON.parse(row.scopes) as string[],
    expiresAt: row.expiresAt as Date,
    revokedAt: (row.revokedAt as Date | null) ?? undefined,
    createdAt: row.createdAt as Date,
    lastUsedAt: (row.lastUsedAt as Date | null) ?? undefined,
  };
}

export function createGrant(
  userId: string,
  agentId: string,
  scopes: string[],
  ttlSeconds: number
): DelegationGrant {
  const now = new Date();
  const grant: DelegationGrant = {
    id: nextGrantId(),
    userId,
    agentId,
    scopes,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    createdAt: now,
  };

  getDb().insert(delegationGrantsTable).values({
    id: grant.id,
    userId: grant.userId,
    agentId: grant.agentId,
    scopes: JSON.stringify(grant.scopes),
    expiresAt: grant.expiresAt,
    revokedAt: null,
    createdAt: grant.createdAt,
    lastUsedAt: null,
  }).run();

  return grant;
}

export function findGrantById(id: string): DelegationGrant | undefined {
  const row = getDb()
    .select()
    .from(delegationGrantsTable)
    .where(eq(delegationGrantsTable.id, id))
    .get();
  return row ? rowToGrant(row) : undefined;
}

export function listGrantsByUser(userId: string): DelegationGrant[] {
  return getDb()
    .select()
    .from(delegationGrantsTable)
    .where(eq(delegationGrantsTable.userId, userId))
    .all()
    .map(rowToGrant);
}

export function listAllGrants(): DelegationGrant[] {
  return getDb().select().from(delegationGrantsTable).all().map(rowToGrant);
}

/** Active = not revoked and not expired. */
export function isGrantActive(grant: DelegationGrant, at: Date = new Date()): boolean {
  return !grant.revokedAt && grant.expiresAt.getTime() > at.getTime();
}

/**
 * Find the newest active grant for an agent covering all requested scopes.
 * Used by token exchange when the caller passes scopes instead of grant_id.
 */
export function findActiveGrantForAgent(
  agentId: string,
  scopes: string[]
): DelegationGrant | undefined {
  const grants = getDb()
    .select()
    .from(delegationGrantsTable)
    .where(eq(delegationGrantsTable.agentId, agentId))
    .all()
    .map(rowToGrant)
    .filter((g) => isGrantActive(g) && scopes.every((s) => g.scopes.includes(s)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return grants[0];
}

export function revokeGrant(id: string): boolean {
  const result = getDb()
    .update(delegationGrantsTable)
    .set({ revokedAt: new Date() })
    .where(eq(delegationGrantsTable.id, id))
    .run();
  return result.changes > 0;
}

export function touchGrantUsage(id: string): void {
  getDb()
    .update(delegationGrantsTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(delegationGrantsTable.id, id))
    .run();
}

/** Test hook: reset the lazily-seeded id counter. */
export function resetGrantCounter(): void {
  _grantCounter = null;
}
