/**
 * Agent identification and tracking types
 */

export interface AgentIdentification {
  agentId?: string;
  agentType?: 'openai' | 'anthropic' | 'custom' | 'human';
  userAgent?: string;
}

export interface AgentContext {
  identification: AgentIdentification;
  requestId: string;
  timestamp: Date;
}
