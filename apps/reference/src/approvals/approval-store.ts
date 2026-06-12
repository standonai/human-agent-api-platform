/**
 * Pending-change store (human-in-the-loop approvals)
 *
 * A pending change is a captured mutation awaiting human consent: the
 * request (method/path/query/body) plus the proposer's principal context.
 * On approval the request is re-dispatched through the full middleware
 * stack under a single-use execution token that restores that context.
 */

import { and, eq, gt, sql } from 'drizzle-orm';
import { getDb, pendingChangesTable, DbPendingChange } from '../db/database.js';
import { DelegationContext } from '../types/auth.js';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'expired';

export interface PendingChange {
  id: string;
  status: ApprovalStatus;
  method: string;
  path: string;
  query: Record<string, string>;
  body?: unknown;
  summary: string;
  ownerUserId: string;
  proposerAgentId?: string;
  proposerTokenUse: 'session' | 'delegated';
  delegationContext?: DelegationContext;
  resultStatus?: number;
  resultBody?: unknown;
  rejectReason?: string;
  execJti?: string;
  expiresAt: Date;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export function approvalTtlSeconds(): number {
  const raw = parseInt(process.env.APPROVAL_TTL_SECONDS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 24 * 60 * 60;
}

let _counter: number | null = null;

function nextApprovalId(): string {
  if (_counter === null) {
    const row = getDb()
      .select({ maxNum: sql<number | null>`MAX(CAST(SUBSTR(id, 10) AS INTEGER))` })
      .from(pendingChangesTable)
      .get();
    _counter = (row?.maxNum ?? 0) + 1;
  }
  return `approval_${_counter++}`;
}

function rowToChange(row: DbPendingChange): PendingChange {
  const change: PendingChange = {
    id: row.id,
    status: row.status as ApprovalStatus,
    method: row.method,
    path: row.path,
    query: row.query ? JSON.parse(row.query) : {},
    body: row.body ? JSON.parse(row.body) : undefined,
    summary: row.summary,
    ownerUserId: row.ownerUserId,
    proposerAgentId: row.proposerAgentId ?? undefined,
    proposerTokenUse: row.proposerTokenUse as 'session' | 'delegated',
    delegationContext: row.delegationContext ? JSON.parse(row.delegationContext) : undefined,
    resultStatus: row.resultStatus ?? undefined,
    resultBody: row.resultBody ? JSON.parse(row.resultBody) : undefined,
    rejectReason: row.rejectReason ?? undefined,
    execJti: row.execJti ?? undefined,
    expiresAt: row.expiresAt as Date,
    createdAt: row.createdAt as Date,
    resolvedAt: (row.resolvedAt as Date | null) ?? undefined,
    resolvedBy: row.resolvedBy ?? undefined,
  };

  // Lazy expiry: a pending change past its deadline reads as expired.
  if (change.status === 'pending' && change.expiresAt.getTime() <= Date.now()) {
    change.status = 'expired';
  }
  return change;
}

export function createPendingChange(params: {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: unknown;
  summary: string;
  ownerUserId: string;
  proposerAgentId?: string;
  proposerTokenUse: 'session' | 'delegated';
  delegationContext?: DelegationContext;
}): PendingChange {
  const now = new Date();
  const id = nextApprovalId();

  getDb().insert(pendingChangesTable).values({
    id,
    status: 'pending',
    method: params.method,
    path: params.path,
    query: JSON.stringify(params.query),
    body: params.body !== undefined ? JSON.stringify(params.body) : null,
    summary: params.summary,
    ownerUserId: params.ownerUserId,
    proposerAgentId: params.proposerAgentId ?? null,
    proposerTokenUse: params.proposerTokenUse,
    delegationContext: params.delegationContext ? JSON.stringify(params.delegationContext) : null,
    expiresAt: new Date(now.getTime() + approvalTtlSeconds() * 1000),
    createdAt: now,
  }).run();

  return findPendingChangeById(id)!;
}

export function findPendingChangeById(id: string): PendingChange | undefined {
  const row = getDb()
    .select()
    .from(pendingChangesTable)
    .where(eq(pendingChangesTable.id, id))
    .get();
  return row ? rowToChange(row) : undefined;
}

export function listPendingChangesByOwner(ownerUserId: string): PendingChange[] {
  return getDb()
    .select()
    .from(pendingChangesTable)
    .where(eq(pendingChangesTable.ownerUserId, ownerUserId))
    .all()
    .map(rowToChange);
}

export function listAllPendingChanges(): PendingChange[] {
  return getDb().select().from(pendingChangesTable).all().map(rowToChange);
}

/**
 * Atomically claim a pending change for execution. Returns false if it was
 * not in 'pending' state (already resolved, being executed, or expired).
 */
export function claimForExecution(id: string, execJti: string, resolvedBy: string): boolean {
  const result = getDb()
    .update(pendingChangesTable)
    .set({ status: 'approved', execJti, resolvedBy, resolvedAt: new Date() })
    .where(
      and(
        eq(pendingChangesTable.id, id),
        eq(pendingChangesTable.status, 'pending'),
        gt(pendingChangesTable.expiresAt, new Date())
      )
    )
    .run();
  return result.changes > 0;
}

export function recordExecutionResult(
  id: string,
  resultStatus: number,
  resultBody: unknown
): void {
  getDb()
    .update(pendingChangesTable)
    .set({
      status: resultStatus < 400 ? 'executed' : 'failed',
      resultStatus,
      resultBody: JSON.stringify(resultBody ?? null),
      execJti: null,
    })
    .where(eq(pendingChangesTable.id, id))
    .run();
}

export function rejectPendingChange(id: string, resolvedBy: string, reason?: string): boolean {
  const result = getDb()
    .update(pendingChangesTable)
    .set({
      status: 'rejected',
      rejectReason: reason ?? null,
      resolvedBy,
      resolvedAt: new Date(),
    })
    .where(and(eq(pendingChangesTable.id, id), eq(pendingChangesTable.status, 'pending')))
    .run();
  return result.changes > 0;
}

/** Test hook. */
export function resetApprovalCounter(): void {
  _counter = null;
}
