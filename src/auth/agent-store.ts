/**
 * Agent Store
 *
 * Manages AI agent registration and API key authentication
 */

import crypto from 'crypto';

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
  rateLimitOverride?: number; // Optional custom rate limit
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

/**
 * In-memory agent registry
 * Replace with database in production
 */
const agents = new Map<string, Agent>();
let agentCounter = 1;

/**
 * Generate cryptographically secure API key
 *
 * Format: agnt_<random-32-bytes>
 * Example: agnt_a7b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const key = randomBytes.toString('hex');
  return `agnt_${key}`;
}

/**
 * Hash API key for storage
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Register a new agent
 */
export function registerAgent(name: string, rateLimitOverride?: number): AgentRegistration {
  // Generate unique API key
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  // Create agent
  const agent: Agent = {
    id: `agent_${agentCounter++}`,
    name,
    apiKeyHash,
    active: true,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    requestCount: 0,
    rateLimitOverride,
  };

  agents.set(agent.id, agent);

  // Return registration (includes API key ONCE)
  return {
    id: agent.id,
    name: agent.name,
    apiKey, // ⚠️ ONLY returned here, never stored or shown again
    createdAt: agent.createdAt,
  };
}

/**
 * Find agent by ID
 */
export function findAgentById(id: string): Agent | undefined {
  return agents.get(id);
}

/**
 * Verify API key and return agent
 */
export function verifyApiKey(apiKey: string): Agent | undefined {
  const hash = hashApiKey(apiKey);

  // Find agent with matching hash
  for (const agent of agents.values()) {
    if (agent.apiKeyHash === hash && agent.active) {
      return agent;
    }
  }

  return undefined;
}

/**
 * Update agent last used timestamp
 */
export function updateAgentActivity(agentId: string): void {
  const agent = agents.get(agentId);
  if (agent) {
    agent.lastUsedAt = new Date();
    agent.requestCount++;
  }
}

/**
 * Deactivate an agent (revoke API key)
 */
export function deactivateAgent(agentId: string): boolean {
  const agent = agents.get(agentId);
  if (agent) {
    agent.active = false;
    return true;
  }
  return false;
}

/**
 * Reactivate an agent
 */
export function reactivateAgent(agentId: string): boolean {
  const agent = agents.get(agentId);
  if (agent) {
    agent.active = true;
    return true;
  }
  return false;
}

/**
 * Get all agents (admin only)
 */
export function getAllAgents(): Omit<Agent, 'apiKeyHash'>[] {
  return Array.from(agents.values()).map(agent => ({
    id: agent.id,
    name: agent.name,
    apiKeyHash: '***hidden***', // Never expose hash
    active: agent.active,
    createdAt: agent.createdAt,
    lastUsedAt: agent.lastUsedAt,
    requestCount: agent.requestCount,
    rateLimitOverride: agent.rateLimitOverride,
  }));
}

/**
 * Delete an agent
 */
export function deleteAgent(agentId: string): boolean {
  return agents.delete(agentId);
}

/**
 * Initialize with example agents for testing
 */
export function initializeDefaultAgents(): void {
  if (agents.size === 0) {
    // Create example agent for testing
    // ⚠️ REMOVE IN PRODUCTION
    const testAgent = registerAgent('test-agent', 1000);

    console.log('🤖 Default agent created for testing:');
    console.log(`   Agent ID: ${testAgent.id}`);
    console.log(`   API Key: ${testAgent.apiKey}`);
    console.log('   ⚠️  Save this API key - it will not be shown again!');
    console.log('   ⚠️  REMOVE THIS IN PRODUCTION!');
  }
}
