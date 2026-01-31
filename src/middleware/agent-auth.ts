/**
 * Agent Authentication Middleware
 *
 * Verifies agent API keys for AI agent access
 */

import { Request, Response, NextFunction } from 'express';
import { verifyApiKey, updateAgentActivity } from '../auth/agent-store.js';
import { ErrorCode } from '../types/errors.js';

/**
 * Require agent API key authentication
 *
 * Agents authenticate using headers:
 *   X-Agent-ID: agent_123
 *   X-Agent-Key: agnt_abc...
 *
 * Usage:
 *   app.post('/api/tasks', requireAgentAuth, createTask);
 */
export function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  const agentId = req.headers['x-agent-id'] as string;
  const apiKey = req.headers['x-agent-key'] as string;

  // Check for required headers
  if (!agentId || !apiKey) {
    res.status(401).json({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Agent authentication required',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'MISSING_AGENT_CREDENTIALS',
          message: 'Agent ID and API key are required',
          suggestion: 'Include X-Agent-ID and X-Agent-Key headers in your request',
        }],
        doc_url: 'https://docs.example.com/agents/auth',
      },
    });
    return;
  }

  // Verify API key
  const agent = verifyApiKey(apiKey);

  if (!agent) {
    res.status(401).json({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid agent credentials',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'INVALID_AGENT_KEY',
          message: 'Agent API key is invalid or has been revoked',
          suggestion: 'Check your API key or register a new agent via POST /api/agents/register',
        }],
        doc_url: 'https://docs.example.com/agents/auth',
      },
    });
    return;
  }

  // Verify agent ID matches
  if (agent.id !== agentId) {
    res.status(401).json({
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Agent ID mismatch',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'AGENT_ID_MISMATCH',
          message: 'The provided agent ID does not match the API key',
          suggestion: 'Use the correct agent ID associated with your API key',
        }],
      },
    });
    return;
  }

  // Check if agent is active
  if (!agent.active) {
    res.status(403).json({
      error: {
        code: ErrorCode.FORBIDDEN,
        message: 'Agent has been deactivated',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'AGENT_DEACTIVATED',
          message: 'This agent has been deactivated and cannot access the API',
          suggestion: 'Contact support to reactivate your agent',
        }],
      },
    });
    return;
  }

  // Update agent activity
  updateAgentActivity(agent.id);

  // Attach agent to request
  req.agent = {
    id: agent.id,
    name: agent.name,
  };

  // Also set for rate limiter
  if (!req.agentContext) {
    (req as any).agentContext = {
      identification: {
        agentId: agent.id,
        agentType: 'authenticated',
      },
    };
  }

  next();
}

/**
 * Optional agent authentication
 *
 * Doesn't block if no agent credentials provided,
 * but verifies them if present
 */
export function optionalAgentAuth(req: Request, _res: Response, next: NextFunction): void {
  const agentId = req.headers['x-agent-id'] as string;
  const apiKey = req.headers['x-agent-key'] as string;

  if (!agentId || !apiKey) {
    // No agent credentials provided, continue without agent
    next();
    return;
  }

  const agent = verifyApiKey(apiKey);

  if (agent && agent.active && agent.id === agentId) {
    // Valid agent credentials
    updateAgentActivity(agent.id);

    req.agent = {
      id: agent.id,
      name: agent.name,
    };

    if (!req.agentContext) {
      (req as any).agentContext = {
        identification: {
          agentId: agent.id,
          agentType: 'authenticated',
        },
      };
    }
  }

  // Continue regardless of whether agent auth succeeded
  next();
}

/**
 * Require either user auth OR agent auth
 *
 * Useful for endpoints accessible by both users and agents
 */
export function requireUserOrAgent(req: Request, res: Response, next: NextFunction): void {
  if (req.user || req.agent) {
    // Already authenticated (by previous middleware)
    next();
    return;
  }

  res.status(401).json({
    error: {
      code: ErrorCode.UNAUTHORIZED,
      message: 'Authentication required',
      request_id: req.requestId || 'unknown',
      details: [{
        code: 'AUTHENTICATION_REQUIRED',
        message: 'This endpoint requires either user or agent authentication',
        suggestion: 'Authenticate as a user (Bearer token) or agent (X-Agent-ID + X-Agent-Key)',
      }],
      doc_url: 'https://docs.example.com/auth',
    },
  });
}
