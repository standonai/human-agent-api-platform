/**
 * Approval resolution endpoints (the human side of human-in-the-loop)
 *
 * - GET    /api/approvals             — list (owner sees own, admin all)
 * - GET    /api/approvals/{id}        — status (owner, proposing agent, admin)
 * - GET    /api/approvals/{id}/events — SSE stream; resolves without polling
 * - POST   /api/approvals/{id}/approve — session only; executes the change
 * - POST   /api/approvals/{id}/reject  — session only
 *
 * Execution re-dispatches the stored request through the full middleware
 * stack under a single-use approval_exec token (see middleware/auth.ts).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { optionalAuth, requireAuth, requireSessionAuth } from '../middleware/auth.js';
import {
  PendingChange,
  claimForExecution,
  findPendingChangeById,
  listAllPendingChanges,
  listPendingChangesByOwner,
  recordExecutionResult,
  rejectPendingChange,
} from '../approvals/approval-store.js';
import { emitApprovalResolved, onApprovalResolved } from '../approvals/events.js';
import { generateApprovalExecToken } from '../auth/jwt-utils.js';
import { ApiExecutor } from '../mcp/executor.js';
import { ErrorCode } from '../types/errors.js';
import { withDocUrl } from '../utils/docs-url.js';

export interface ApprovalsRouterOptions {
  executor: ApiExecutor;
}

function changeResponse(change: PendingChange) {
  return {
    id: change.id,
    status: change.status,
    summary: change.summary,
    method: change.method,
    path: change.path,
    body: change.body ?? null,
    proposer_agent_id: change.proposerAgentId ?? null,
    proposer_token_use: change.proposerTokenUse,
    owner_user_id: change.ownerUserId,
    result_status: change.resultStatus ?? null,
    result_body: change.resultBody ?? null,
    reject_reason: change.rejectReason ?? null,
    expires_at: change.expiresAt.toISOString(),
    created_at: change.createdAt.toISOString(),
    resolved_at: change.resolvedAt?.toISOString() ?? null,
    resolved_by: change.resolvedBy ?? null,
  };
}

function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ErrorCode.RESOURCE_NOT_FOUND,
      message: 'Approval not found',
      target: 'id',
      request_id: req.requestId || 'unknown',
      details: [{
        code: 'UNKNOWN_APPROVAL',
        message: 'No approval with this id is visible to you',
        suggestion: 'List approvals via GET /api/approvals',
      }],
      ...withDocUrl('/approvals'),
    },
  });
}

/** Owner user, proposing agent, or admin may see an approval. */
function canView(req: Request, change: PendingChange): boolean {
  if (req.user?.role === 'admin') return true;
  if (req.user && req.user.id === change.ownerUserId) return true;
  if (req.agent && change.proposerAgentId && req.agent.id === change.proposerAgentId) return true;
  return false;
}

export function createApprovalsRouter(options: ApprovalsRouterOptions): Router {
  const router = Router();

  router.get('/', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    try {
      const changes =
        req.user!.role === 'admin'
          ? listAllPendingChanges()
          : listPendingChangesByOwner(req.user!.id);
      res.json({ data: { approvals: changes.map(changeResponse) } });
    } catch (error) {
      next(error);
    }
  });

  // Status: agents may poll their own proposals, so agent tokens are
  // acceptable here (manual principal check instead of requireAuth).
  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    requireAnyPrincipal(req, res, () => {
      try {
        const change = findPendingChangeById(req.params.id);
        if (!change || !canView(req, change)) {
          notFound(req, res);
          return;
        }
        res.json({ data: changeResponse(change) });
      } catch (error) {
        next(error);
      }
    });
  });

  router.get('/:id/events', (req: Request, res: Response, next: NextFunction) => {
    requireAnyPrincipal(req, res, () => {
      try {
        const change = findPendingChangeById(req.params.id);
        if (!change || !canView(req, change)) {
          notFound(req, res);
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const send = (event: object) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        send({ approval_id: change.id, status: change.status });

        // Already resolved (or expired): emit terminal state and close.
        if (change.status !== 'pending') {
          res.end();
          return;
        }

        const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
        const unsubscribe = onApprovalResolved(change.id, (event) => {
          send(event);
          cleanup();
          res.end();
        });
        const cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
        };
        req.on('close', cleanup);
      } catch (error) {
        next(error);
      }
    });
  });

  router.post('/:id/approve', requireSessionAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const change = findPendingChangeById(req.params.id);
      if (!change || !canView(req, change)) {
        notFound(req, res);
        return;
      }

      if (change.status !== 'pending') {
        res.status(409).json({
          error: {
            code: ErrorCode.CONFLICT,
            message: `Approval is already ${change.status}`,
            request_id: req.requestId || 'unknown',
            details: [{
              code: 'APPROVAL_NOT_PENDING',
              message: `Current status: ${change.status}`,
              suggestion: 'Check the approval status via GET /api/approvals/{id}',
            }],
            ...withDocUrl('/approvals'),
          },
        });
        return;
      }

      const execJti = randomUUID();
      if (!claimForExecution(change.id, execJti, req.user!.id)) {
        res.status(409).json({
          error: {
            code: ErrorCode.CONFLICT,
            message: 'Approval was resolved concurrently',
            request_id: req.requestId || 'unknown',
            details: [{
              code: 'APPROVAL_RACE',
              message: 'Another request resolved this approval first',
              suggestion: 'Check the approval status via GET /api/approvals/{id}',
            }],
            ...withDocUrl('/approvals'),
          },
        });
        return;
      }

      const execToken = generateApprovalExecToken(change.id, execJti);
      const result = await options.executor({
        method: change.method,
        path: change.path,
        query: change.query,
        headers: { authorization: `Bearer ${execToken}` },
        body: change.body,
      });

      recordExecutionResult(change.id, result.status, result.body);
      const resolved = findPendingChangeById(change.id)!;
      emitApprovalResolved(resolved);

      res.json({ data: changeResponse(resolved) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/reject', requireSessionAuth, (req: Request, res: Response, next: NextFunction) => {
    try {
      const change = findPendingChangeById(req.params.id);
      if (!change || !canView(req, change)) {
        notFound(req, res);
        return;
      }

      if (!rejectPendingChange(change.id, req.user!.id, (req.body || {}).reason)) {
        res.status(409).json({
          error: {
            code: ErrorCode.CONFLICT,
            message: `Approval is already ${change.status}`,
            request_id: req.requestId || 'unknown',
            details: [{
              code: 'APPROVAL_NOT_PENDING',
              message: `Current status: ${change.status}`,
              suggestion: 'Only pending approvals can be rejected',
            }],
            ...withDocUrl('/approvals'),
          },
        });
        return;
      }

      const resolved = findPendingChangeById(change.id)!;
      emitApprovalResolved(resolved);
      res.json({ data: changeResponse(resolved) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/**
 * Like requireAuth but also accepts agent tokens (agents poll their own
 * proposals). Visibility is enforced per-resource by canView.
 */
function requireAnyPrincipal(req: Request, res: Response, next: () => void): void {
  optionalAuth(req, res, () => {
    if (req.user || req.agent) {
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
          message: 'Authenticate as the approving user or the proposing agent',
          suggestion: 'Send a Bearer token (session, delegated, or agent token from POST /oauth/token)',
        }],
        ...withDocUrl('/approvals'),
      },
    });
  });
}
