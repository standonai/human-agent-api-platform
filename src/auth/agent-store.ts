/**
 * Agent Store (SQLite via Drizzle ORM)
 *
 * All function signatures unchanged — better-sqlite3 is synchronous.
 */

import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb, agentsTable, DbAgent } from '../db/database.js';

/**
 * Agent credentials and metadata
 */
export interface Agent {
  id: string;
  name: string;
  apiKeyHash: string; // SHA-256 hash of API key (never store plain text)
  active: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  requestCount: number;
  rateLimitOverride?: number;
}

/**
 * Agent registration response
 */
export interface AgentRegistration {
  id: string;
  name: string;
  apiKey: string; // ⚠️ Returned ONCE, never stored or shown again
  createdAt: Date;
}

// ─── ID counter (lazily seeded from DB) ──────────────────────────────────────

let _agentCounter: number | null = null;

function nextAgentId(): string {
  if (_agentCounter === null) {
    const row = getDb()
      .select({ maxNum: sql<number | null>`MAX(CAST(SUBSTR(id, 7) AS INTEGER))` })
      .from(agentsTable)
      .get();
    _agentCounter = (row?.maxNum ?? 0) + 1;
  }
  return `agent_${_agentCounter++}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateApiKey(): string {
  return `agnt_${crypto.randomBytes(32).toString('hex')}`;
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function rowToAgent(row: DbAgent): Agent {
  return {
    id:               row.id,
    name:             row.name,
    apiKeyHash:       row.apiKeyHash,
    active:           Boolean(row.active),
    createdAt:        row.createdAt as Date,
    lastUsedAt:       row.lastUsedAt as Date,
    requestCount:     row.requestCount,
    rateLimitOverride: row.rateLimitOverride ?? undefined,
  };
}

// ─── Public API (signatures unchanged) ───────────────────────────────────────

/**
 * Register a new agent
 */
export function registerAgent(name: string, rateLimitOverride?: number): AgentRegistration {
  const apiKey     = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const now        = new Date();

  const agent: Agent = {
    id:               nextAgentId(),
    name,
    apiKeyHash,
    active:           true,
    createdAt:        now,
    lastUsedAt:       now,
    requestCount:     0,
    rateLimitOverride,
  };

  getDb().insert(agentsTable).values({
    id:               agent.id,
    name:             agent.name,
    apiKeyHash:       agent.apiKeyHash,
    active:           true,
    createdAt:        agent.createdAt,
    lastUsedAt:       agent.lastUsedAt,
    requestCount:     0,
    rateLimitOverride: agent.rateLimitOverride ?? null,
  }).run();

  return {
    id:        agent.id,
    name:      agent.name,
    apiKey,    // ⚠️ ONLY returned here, never stored or shown again
    createdAt: agent.createdAt,
  };
}

/**
 * Find agent by ID
 */
export function findAgentById(id: string): Agent | undefined {
  const row = getDb().select().from(agentsTable).where(eq(agentsTable.id, id)).get();
  return row ? rowToAgent(row) : undefined;
}

/**
 * Verify API key and return agent
 */
export function verifyApiKey(apiKey: string): Agent | undefined {
  const hash = hashApiKey(apiKey);
  const row  = getDb()
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.apiKeyHash, hash))
    .get();

  if (!row || !row.active) return undefined;
  return rowToAgent(row);
}

/**
 * Update agent last used timestamp and increment request count
 */
export function updateAgentActivity(agentId: string): void {
  getDb()
    .update(agentsTable)
    .set({
      lastUsedAt:   new Date(),
      requestCount: sql`${agentsTable.requestCount} + 1`,
    })
    .where(eq(agentsTable.id, agentId))
    .run();
}

/**
 * Deactivate an agent (revoke API key)
 */
export function deactivateAgent(agentId: string): boolean {
  const result = getDb()
    .update(agentsTable)
    .set({ active: false })
    .where(eq(agentsTable.id, agentId))
    .run();
  return result.changes > 0;
}

/**
 * Reactivate an agent
 */
export function reactivateAgent(agentId: string): boolean {
  const result = getDb()
    .update(agentsTable)
    .set({ active: true })
    .where(eq(agentsTable.id, agentId))
    .run();
  return result.changes > 0;
}

/**
 * Get all agents (admin only)
 */
export function getAllAgents(): Omit<Agent, 'apiKeyHash'>[] {
  return getDb()
    .select()
    .from(agentsTable)
    .all()
    .map(row => ({
      id:               row.id,
      name:             row.name,
      apiKeyHash:       '***hidden***',
      active:           Boolean(row.active),
      createdAt:        row.createdAt as Date,
      lastUsedAt:       row.lastUsedAt as Date,
      requestCount:     row.requestCount,
      rateLimitOverride: row.rateLimitOverride ?? undefined,
    }));
}

/**
 * Delete an agent
 */
export function deleteAgent(agentId: string): boolean {
  const result = getDb().delete(agentsTable).where(eq(agentsTable.id, agentId)).run();
  return result.changes > 0;
}

/**
 * Initialize with example agents for testing.
 * Guarded: skips if any agent already exists.
 */
export function initializeDefaultAgents(): void {
  const bootstrapEnabled =
    process.env.NODE_ENV === 'test' || process.env.ENABLE_BOOTSTRAP_SEEDING === 'true';

  if (!bootstrapEnabled) {
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Bootstrap seeding is disabled in production. Remove ENABLE_BOOTSTRAP_SEEDING.'
    );
  }

  const countRow = getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(agentsTable)
    .get();

  if ((countRow?.count ?? 0) > 0) return;

  const bootstrapAgentName = process.env.BOOTSTRAP_AGENT_NAME || 'test-agent';
  const testAgent = registerAgent(bootstrapAgentName, 1000);

  console.log('🤖 Default agent created for testing:');
  console.log(`   Agent ID: ${testAgent.id}`);
  console.log('   ⚠️  API key generated for bootstrap use; rotate/remove before production.');
}
