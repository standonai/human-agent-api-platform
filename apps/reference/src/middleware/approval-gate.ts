/**
 * Human-in-the-loop approval gate.
 *
 * Mounted on mutation routes after auth/scope/ownership checks. When the
 * caller asks for `?require_approval=true` — or the operator's policy
 * demands it — the request is captured as a pending change instead of
 * executing, and the agent receives 202 + a status URL. A human (the
 * effective user) approves or rejects; approval re-dispatches the request
 * through the full stack under a single-use execution token.
 *
 * Policy hook (APPROVAL_POLICY):
 *   none                  — only explicit ?require_approval=true (default)
 *   delegated-destructive — DELETE by a delegated agent always needs approval
 */

import { Request, Response, NextFunction } from 'express';
import { createPendingChange } from '../approvals/approval-store.js';
import { ErrorCode } from '@standonai/agent-errors/errors';
import { withDocUrl } from '@standonai/agent-errors/docs-url';

export const REQUIRE_APPROVAL_PARAM = 'require_approval';

function policyRequiresApproval(req: Request): boolean {
  const policy = (process.env.APPROVAL_POLICY || 'none').toLowerCase();
  if (policy === 'delegated-destructive') {
    return req.method === 'DELETE' && !!req.delegation;
  }
  return false;
}

export function approvalGate(req: Request, res: Response, next: NextFunction): void {
  const requested = req.query[REQUIRE_APPROVAL_PARAM] === 'true';
  const forced = policyRequiresApproval(req);

  if (!requested && !forced) {
    next();
    return;
  }

  // Dry-run previews pass through: previewing never needs consent.
  if (req.query.dry_run === 'true') {
    next();
    return;
  }

  // Approvals need a human who can consent: the effective user principal.
  if (!req.user) {
    res.status(400).json({
      error: {
        code: ErrorCode.INVALID_PARAMETER,
        message: 'Approval requires a user to consent',
        target: REQUIRE_APPROVAL_PARAM,
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'NO_APPROVER',
          message: 'Agent-as-itself requests have no human owner to approve them',
          suggestion: 'Act on behalf of a user via a delegated token (POST /oauth/token, token-exchange) so the user can approve',
        }],
        ...withDocUrl('/approvals'),
      },
    });
    return;
  }

  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (k === REQUIRE_APPROVAL_PARAM) continue;
    if (typeof v === 'string') query[k] = v;
  }

  const change = createPendingChange({
    method: req.method,
    path: (req.baseUrl || '') + req.path,
    query,
    body: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
    summary: `${req.method} ${(req.baseUrl || '') + req.path}`,
    ownerUserId: req.user.id,
    proposerAgentId: req.agent?.id,
    proposerTokenUse: req.tokenUse === 'delegated' ? 'delegated' : 'session',
    delegationContext: req.delegation,
  });

  res.status(202).json({
    data: {
      approval_id: change.id,
      status: change.status,
      required_by_policy: forced && !requested,
      status_url: `/api/approvals/${change.id}`,
      events_url: `/api/approvals/${change.id}/events`,
      expires_at: change.expiresAt.toISOString(),
      message:
        'Change captured for human approval. Poll status_url, or stream ' +
        'events_url (SSE) to learn the outcome without polling.',
    },
  });
}
