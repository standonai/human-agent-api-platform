/**
 * Agent Tracking middleware
 * Identifies and tracks AI agent requests for observability
 */

import { Request, Response, NextFunction } from 'express';
import { AgentContext, AgentIdentification } from '../types/agent.js';
import { trackAgentCall } from '../observability/metrics-store.js';

declare global {
  namespace Express {
    interface Request {
      agentContext?: AgentContext;
    }
  }
}

/**
 * Parse User-Agent header to detect known AI agents
 */
function parseUserAgent(userAgent: string): AgentIdentification {
  const ua = userAgent.toLowerCase();

  // Detect OpenAI agents
  if (ua.includes('openai') || ua.includes('gpt')) {
    return {
      agentType: 'openai',
      userAgent,
    };
  }

  // Detect Anthropic agents
  if (ua.includes('anthropic') || ua.includes('claude')) {
    return {
      agentType: 'anthropic',
      userAgent,
    };
  }

  // Check for generic bot/agent patterns
  if (ua.includes('bot') || ua.includes('agent') || ua.includes('crawler')) {
    return {
      agentType: 'custom',
      userAgent,
    };
  }

  // Default to human
  return {
    agentType: 'human',
    userAgent,
  };
}

/**
 * Middleware that identifies and tracks AI agents
 */
export function agentTrackingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get agent ID from header if present
  const agentId = req.headers['x-agent-id'] as string;
  const userAgent = req.headers['user-agent'] as string || 'unknown';

  // Parse user agent to detect agent type
  const identification = parseUserAgent(userAgent);

  // Override with explicit agent ID if provided
  if (agentId) {
    identification.agentId = agentId;
  }

  // Create agent context
  req.agentContext = {
    identification,
    requestId: req.requestId || 'unknown',
    timestamp: new Date(),
  };

  // Add agent identification to response headers for debugging
  if (identification.agentType !== 'human' && identification.agentType) {
    res.setHeader('X-Detected-Agent-Type', identification.agentType);
  }

  // Track agent calls for zero-shot success rate metric
  if (identification.agentType !== 'human' && identification.agentId) {
    trackAgentCall(identification.agentId, req.path);
  }

  next();
}

/**
 * Helper to check if request is from an AI agent
 */
export function isAgentRequest(req: Request): boolean {
  return req.agentContext?.identification.agentType !== 'human';
}

/**
 * Helper to get agent type
 */
export function getAgentType(req: Request): string {
  return req.agentContext?.identification.agentType || 'unknown';
}
