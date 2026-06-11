/**
 * Agent Management Routes
 *
 * Register and manage AI agents
 */

import { Router, Request, Response } from 'express';
import { ErrorCode } from '../types/errors.js';
import { ApiError } from '../middleware/error-handler.js';
import {
  registerAgent,
  findAgentById,
  getAllAgents,
  deactivateAgent,
  reactivateAgent,
  deleteAgent,
} from '../auth/agent-store.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import { UserRole } from '../types/auth.js';

const router = Router();

/**
 * POST /api/agents/register
 * Register a new AI agent
 *
 * Requires: Admin authentication
 */
router.post('/register', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response, next) => {
  try {
    const { name, rateLimitOverride } = req.body;

    // Validation
    if (!name || typeof name !== 'string') {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Agent name is required',
        'name',
        [{
          code: 'MISSING_NAME',
          message: 'Agent name must be provided',
          suggestion: 'Provide a descriptive name for the agent (e.g., "production-bot", "gpt-4-assistant")',
        }]
      );
    }

    // Validate rate limit override if provided
    if (rateLimitOverride !== undefined) {
      if (typeof rateLimitOverride !== 'number' || rateLimitOverride < 0) {
        throw new ApiError(
          400,
          ErrorCode.INVALID_PARAMETER,
          'Invalid rate limit override',
          'rateLimitOverride',
          [{
            code: 'INVALID_RATE_LIMIT',
            message: 'Rate limit must be a positive number',
            suggestion: 'Provide a valid rate limit (requests per minute)',
          }]
        );
      }
    }

    // Register agent
    const agent = registerAgent(name, rateLimitOverride);

    res.status(201).json({
      data: agent,
      warning: '⚠️ Save the API key - it will not be shown again!',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents
 * List all registered agents
 *
 * Requires: Admin authentication
 */
router.get('/', requireAuth, requireRole(UserRole.ADMIN), (_req: Request, res: Response) => {
  const agents = getAllAgents();

  res.status(200).json({
    data: agents,
    meta: {
      total: agents.length,
    },
  });
});

/**
 * GET /api/agents/:id
 * Get agent details
 *
 * Requires: Admin authentication
 */
router.get('/:id', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const agent = findAgentById(id);

    if (!agent) {
      throw new ApiError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Agent not found',
        'id',
        [{
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID '${id}' does not exist`,
          suggestion: 'Check the agent ID or use GET /api/agents to list all agents',
        }]
      );
    }

    // Remove API key hash from response
    const { apiKeyHash, ...agentData } = agent;

    res.status(200).json({
      data: {
        ...agentData,
        apiKeyHash: '***hidden***',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agents/:id/deactivate
 * Deactivate an agent (revoke API key)
 *
 * Requires: Admin authentication
 */
router.post('/:id/deactivate', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const success = deactivateAgent(id);

    if (!success) {
      throw new ApiError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Agent not found',
        'id',
        [{
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID '${id}' does not exist`,
          suggestion: 'Check the agent ID or use GET /api/agents to list all agents',
        }]
      );
    }

    res.status(200).json({
      data: {
        message: 'Agent deactivated successfully',
        agentId: id,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agents/:id/reactivate
 * Reactivate a deactivated agent
 *
 * Requires: Admin authentication
 */
router.post('/:id/reactivate', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const success = reactivateAgent(id);

    if (!success) {
      throw new ApiError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Agent not found',
        'id',
        [{
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID '${id}' does not exist`,
          suggestion: 'Check the agent ID or use GET /api/agents to list all agents',
        }]
      );
    }

    res.status(200).json({
      data: {
        message: 'Agent reactivated successfully',
        agentId: id,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/agents/:id
 * Delete an agent permanently
 *
 * Requires: Admin authentication
 */
router.delete('/:id', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const success = deleteAgent(id);

    if (!success) {
      throw new ApiError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        'Agent not found',
        'id',
        [{
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID '${id}' does not exist`,
          suggestion: 'Check the agent ID or use GET /api/agents to list all agents',
        }]
      );
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
