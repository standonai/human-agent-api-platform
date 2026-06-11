/**
 * DB-backed Task Store
 *
 * Replaces the inline Map<string, Task> from tasks-routes.ts.
 * All functions are synchronous (better-sqlite3 is a sync driver).
 */

import { eq, and, sql } from 'drizzle-orm';
import { getDb, tasksTable, DbTask } from './database.js';
import { ResourceOwnership } from '../types/auth.js';

export interface Task extends ResourceOwnership {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── ID counter (seeded lazily from DB on first write) ───────────────────────

let _taskCounter: number | null = null;

function nextTaskId(): string {
  if (_taskCounter === null) {
    const row = getDb()
      .select({ maxNum: sql<number | null>`MAX(CAST(SUBSTR(id, 6) AS INTEGER))` })
      .from(tasksTable)
      .get();
    _taskCounter = (row?.maxNum ?? 0) + 1;
  }
  return `task_${_taskCounter++}`;
}

// ─── Row → domain object ──────────────────────────────────────────────────────

function rowToTask(row: DbTask): Task {
  return {
    id:          row.id,
    title:       row.title,
    description: row.description ?? undefined,
    status:      row.status as Task['status'],
    assignee:    row.assignee ?? undefined,
    createdBy:   row.createdBy,
    ownerId:     row.ownerId,
    updatedBy:   row.updatedBy ?? undefined,
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function dbGetTask(id: string): Task | undefined {
  const row = getDb().select().from(tasksTable).where(eq(tasksTable.id, id)).get();
  return row ? rowToTask(row) : undefined;
}

export interface ListTasksOptions {
  status?:   string;
  assignee?: string;
  /** If not admin, only return tasks owned/created by callerId */
  callerId?: string;
  isAdmin:   boolean;
  limit:     number;
  offset:    number;
}

export function dbListTasks(opts: ListTasksOptions): { tasks: Task[]; total: number } {
  const db = getDb();

  const conditions = [];

  if (!opts.isAdmin && opts.callerId) {
    conditions.push(sql`(${tasksTable.ownerId} = ${opts.callerId} OR ${tasksTable.createdBy} = ${opts.callerId})`);
  }

  if (opts.status) {
    conditions.push(eq(tasksTable.status, opts.status));
  }

  if (opts.assignee) {
    conditions.push(eq(tasksTable.assignee, opts.assignee));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count
  const countRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasksTable)
    .where(where)
    .get();
  const total = countRow?.count ?? 0;

  // Paginated rows
  const rows = db
    .select()
    .from(tasksTable)
    .where(where)
    .limit(opts.limit)
    .offset(opts.offset)
    .all();

  return { tasks: rows.map(rowToTask), total };
}

export function dbCreateTask(data: Omit<Task, 'id'>): Task {
  const id = nextTaskId();
  const task: Task = { id, ...data };

  getDb().insert(tasksTable).values({
    id:          task.id,
    title:       task.title,
    description: task.description ?? null,
    status:      task.status,
    assignee:    task.assignee ?? null,
    createdBy:   task.createdBy,
    ownerId:     task.ownerId,
    updatedBy:   task.updatedBy ?? null,
    createdAt:   task.createdAt,
    updatedAt:   task.updatedAt,
  }).run();

  return task;
}

export function dbUpdateTask(id: string, updates: Partial<Task>): Task | undefined {
  const { id: _id, createdAt: _ca, createdBy: _cb, ...safeUpdates } = updates as any;

  getDb()
    .update(tasksTable)
    .set({
      title:       safeUpdates.title,
      description: safeUpdates.description ?? null,
      status:      safeUpdates.status,
      assignee:    safeUpdates.assignee ?? null,
      ownerId:     safeUpdates.ownerId,
      updatedBy:   safeUpdates.updatedBy ?? null,
      updatedAt:   safeUpdates.updatedAt,
    })
    .where(eq(tasksTable.id, id))
    .run();

  return dbGetTask(id);
}

export function dbDeleteTask(id: string): boolean {
  const result = getDb().delete(tasksTable).where(eq(tasksTable.id, id)).run();
  return result.changes > 0;
}
