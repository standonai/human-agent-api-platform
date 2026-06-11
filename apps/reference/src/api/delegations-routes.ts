/**
 * Delegation grant management (the consent surface)
 *
 * Grants can only be created and revoked from a human session — an agent
 * must never mint or extend its own authority (requireSessionAuth).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireSessionAuth } from '../middleware/auth.js';
import { findAgentById } from '../auth/agent-store.js';
import {
  VALID_SCOPES,
  createGrant,
  defaultGrantTtlSeconds,
  findGrantById,
  isGrantActive,
  listAllGrants,
  listGrantsByUser,
  maxGrantTtlSeconds,
  revokeGrant,
  DelegationGrant,
} from '../auth/delegation-store.js';
import { ErrorCode } from '../types/errors.js';
import { withDocUrl } from '../utils/docs-url.js';

const router = Router();

function grantResponse(grant: DelegationGrant) {
  return {
    id: grant.id,
    agent_id: grant.agentId,
    user_id: grant.userId,
    scopes: grant.scopes,
    active: isGrantActive(grant),
    expires_at: grant.expiresAt.toISOString(),
    revoked_at: grant.revokedAt?.toISOString() ?? null,
    created_at: grant.createdAt.toISOString(),
    last_used_at: grant.lastUsedAt?.toISOString() ?? null,
  };
}

/**
 * POST /api/delegations — grant an agent scoped, time-boxed authority.
 */
router.post('/', requireSessionAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agent_id: agentId, scopes, expires_in: expiresIn } = req.body as {
      agent_id?: string;
      scopes?: unknown;
      expires_in?: unknown;
    };

    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: {
          code: ErrorCode.MISSING_REQUIRED_FIELD,
          message: 'agent_id is required',
          target: 'agent_id',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'MISSING_FIELD',
            message: 'Provide the id of the agent to delegate to',
            suggestion: 'List registered agents via GET /api/agents (admin) or use the id from agent registration',
          }],
          ...withDocUrl('/delegations'),
        },
      });
      return;
    }

    const agent = findAgentById(agentId);
    if (!agent || !agent.active) {
      res.status(404).json({
        error: {
          code: ErrorCode.RESOURCE_NOT_FOUND,
          message: 'Agent not found or inactive',
          target: 'agent_id',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'UNKNOWN_AGENT',
            message: `No active agent with id '${agentId}'`,
            suggestion: 'Register the agent first via POST /api/agents/register',
          }],
          ...withDocUrl('/agents'),
        },
      });
      return;
    }

    if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((s) => typeof s === 'string')) {
      res.status(400).json({
        error: {
          code: ErrorCode.INVALID_PARAMETER,
          message: 'scopes must be a non-empty array of scope strings',
          target: 'scopes',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'INVALID_SCOPES',
            message: `Valid scopes: ${VALID_SCOPES.join(', ')}`,
            suggestion: `Pass scopes as a JSON array, e.g. ["tasks:read","tasks:write"]`,
          }],
          ...withDocUrl('/delegations'),
        },
      });
      return;
    }

    const invalid = scopes.filter((s) => !(VALID_SCOPES as readonly string[]).includes(s));
    if (invalid.length > 0) {
      res.status(400).json({
        error: {
          code: ErrorCode.INVALID_PARAMETER,
          message: `Unknown scope(s): ${invalid.join(', ')}`,
          target: 'scopes',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'UNKNOWN_SCOPE',
            message: `Valid scopes: ${VALID_SCOPES.join(', ')}`,
            suggestion: 'Remove the unknown scopes from the request',
          }],
          ...withDocUrl('/delegations'),
        },
      });
      return;
    }

    const maxTtl = maxGrantTtlSeconds();
    let ttl = defaultGrantTtlSeconds();
    if (expiresIn !== undefined) {
      const parsed = Number(expiresIn);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > maxTtl) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALUE_OUT_OF_RANGE,
            message: 'expires_in is out of range',
            target: 'expires_in',
            request_id: req.requestId || 'unknown',
            details: [{
              code: 'VALUE_OUT_OF_RANGE',
              message: `expires_in must be between 1 and ${maxTtl} seconds`,
              suggestion: `Use a value up to ${maxTtl} (server cap, DELEGATION_MAX_TTL_SECONDS)`,
            }],
            ...withDocUrl('/delegations'),
          },
        });
        return;
      }
      ttl = parsed;
    }

    const grant = createGrant(req.user!.id, agentId, scopes as string[], ttl);
    res.status(201).json({ data: grantResponse(grant) });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/delegations — list own grants (admins see all).
 */
router.get('/', requireSessionAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const grants =
      req.user!.role === 'admin' ? listAllGrants() : listGrantsByUser(req.user!.id);
    res.json({ data: { delegations: grants.map(grantResponse) } });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/delegations/{id} — revoke (owner or admin). Immediate.
 */
router.delete('/:id', requireSessionAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const grant = findGrantById(req.params.id);

    if (!grant || (grant.userId !== req.user!.id && req.user!.role !== 'admin')) {
      // 404 for both unknown and non-owned: don't leak grant existence.
      res.status(404).json({
        error: {
          code: ErrorCode.RESOURCE_NOT_FOUND,
          message: 'Delegation grant not found',
          target: 'id',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'UNKNOWN_GRANT',
            message: 'No grant with this id belongs to you',
            suggestion: 'List your grants via GET /api/delegations',
          }],
          ...withDocUrl('/delegations'),
        },
      });
      return;
    }

    revokeGrant(grant.id);
    res.json({
      data: {
        id: grant.id,
        revoked: true,
        message: 'Grant revoked. Outstanding delegated tokens are rejected immediately.',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
