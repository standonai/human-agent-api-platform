/**
 * OAuth 2.1-shaped token endpoint
 *
 * POST /oauth/token (JSON or form-encoded), two grant types:
 *
 *   client_credentials
 *     client_id=<agent id> client_secret=<agent API key>
 *     → agent token (agent acting as itself)
 *
 *   urn:ietf:params:oauth:grant-type:token-exchange   (RFC 8693)
 *     subject_token=<agent token> [grant_id=...] [scope="tasks:read ..."]
 *     → delegated token (agent acting on behalf of the granting user)
 *
 * Token responses are standard OAuth JSON. Errors use the platform
 * envelope so agents get a `suggestion` to self-correct.
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  generateAgentToken,
  generateDelegatedToken,
  oauthTokenTtlSeconds,
  verifyAccessToken,
} from '../auth/jwt-utils.js';
import { verifyApiKey, updateAgentActivity } from '../auth/agent-store.js';
import {
  findGrantById,
  findActiveGrantForAgent,
  isGrantActive,
} from '../auth/delegation-store.js';
import { ErrorCode } from '../types/errors.js';
import { withDocUrl } from '../utils/docs-url.js';

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';

const router = Router();

function tokenError(
  req: Request,
  res: Response,
  status: number,
  detail: { code: string; message: string; suggestion: string }
): void {
  res.status(status).json({
    error: {
      code: status === 400 ? ErrorCode.INVALID_PARAMETER : ErrorCode.UNAUTHORIZED,
      message: detail.message,
      request_id: req.requestId || 'unknown',
      details: [detail],
      ...withDocUrl('/oauth'),
    },
  });
}

router.post('/token', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body || {}) as Record<string, string>;
    const grantType = body.grant_type;

    if (grantType === 'client_credentials') {
      handleClientCredentials(req, res, body);
      return;
    }

    if (grantType === TOKEN_EXCHANGE_GRANT) {
      handleTokenExchange(req, res, body);
      return;
    }

    tokenError(req, res, 400, {
      code: 'UNSUPPORTED_GRANT_TYPE',
      message: `Unsupported grant_type '${grantType ?? ''}'`,
      suggestion: `Use 'client_credentials' or '${TOKEN_EXCHANGE_GRANT}'`,
    });
  } catch (error) {
    next(error);
  }
});

function handleClientCredentials(
  req: Request,
  res: Response,
  body: Record<string, string>
): void {
  const { client_id: clientId, client_secret: clientSecret } = body;

  if (!clientId || !clientSecret) {
    tokenError(req, res, 400, {
      code: 'MISSING_CLIENT_CREDENTIALS',
      message: 'client_id and client_secret are required',
      suggestion: 'Pass your agent id as client_id and agent API key as client_secret',
    });
    return;
  }

  const agent = verifyApiKey(clientSecret);
  if (!agent || agent.id !== clientId || !agent.active) {
    tokenError(req, res, 401, {
      code: 'INVALID_CLIENT',
      message: 'Invalid agent credentials',
      suggestion: 'Check the agent id/key pair, or register a new agent via POST /api/agents/register',
    });
    return;
  }

  updateAgentActivity(agent.id);

  res.json({
    access_token: generateAgentToken(agent.id),
    token_type: 'Bearer',
    expires_in: oauthTokenTtlSeconds(),
  });
}

function handleTokenExchange(
  req: Request,
  res: Response,
  body: Record<string, string>
): void {
  const { subject_token: subjectToken, grant_id: grantId, scope } = body;

  if (!subjectToken) {
    tokenError(req, res, 400, {
      code: 'MISSING_SUBJECT_TOKEN',
      message: 'subject_token is required',
      suggestion: 'Obtain an agent token via grant_type=client_credentials first, then pass it as subject_token',
    });
    return;
  }

  let agentId: string;
  try {
    const payload = verifyAccessToken(subjectToken);
    if (payload.token_use !== 'agent') {
      throw new Error('NOT_AGENT_TOKEN');
    }
    agentId = payload.sub;
  } catch {
    tokenError(req, res, 401, {
      code: 'INVALID_SUBJECT_TOKEN',
      message: 'subject_token must be a valid agent token',
      suggestion: 'Exchange your agent API key for an agent token via grant_type=client_credentials',
    });
    return;
  }

  let grant;
  if (grantId) {
    grant = findGrantById(grantId);
    if (!grant || grant.agentId !== agentId) {
      tokenError(req, res, 401, {
        code: 'UNKNOWN_GRANT',
        message: 'No such delegation grant for this agent',
        suggestion: 'Ask the user to create a grant via POST /api/delegations and use its id',
      });
      return;
    }
  } else {
    const requestedScopes = (scope || '').split(' ').filter(Boolean);
    if (requestedScopes.length === 0) {
      tokenError(req, res, 400, {
        code: 'MISSING_GRANT_REFERENCE',
        message: 'Provide grant_id or scope to select a delegation grant',
        suggestion: 'Pass grant_id=<id>, or scope="tasks:read tasks:write" to use the newest matching grant',
      });
      return;
    }
    grant = findActiveGrantForAgent(agentId, requestedScopes);
    if (!grant) {
      tokenError(req, res, 401, {
        code: 'NO_MATCHING_GRANT',
        message: 'No active delegation grant covers the requested scopes',
        suggestion: 'Ask the user to create a grant with these scopes via POST /api/delegations',
      });
      return;
    }
  }

  if (!isGrantActive(grant)) {
    tokenError(req, res, 401, {
      code: grant.revokedAt ? 'GRANT_REVOKED' : 'GRANT_EXPIRED',
      message: grant.revokedAt
        ? 'The delegation grant has been revoked'
        : 'The delegation grant has expired',
      suggestion: 'Ask the user to create a new delegation grant (POST /api/delegations)',
    });
    return;
  }

  // Optional scope narrowing: token scope may be a subset of the grant.
  let scopes = grant.scopes;
  if (scope) {
    const requested = scope.split(' ').filter(Boolean);
    const outside = requested.filter((s) => !grant.scopes.includes(s));
    if (outside.length > 0) {
      tokenError(req, res, 400, {
        code: 'SCOPE_EXCEEDS_GRANT',
        message: `Requested scope(s) not in the grant: ${outside.join(', ')}`,
        suggestion: `The grant allows: ${grant.scopes.join(', ')}. Request a subset, or ask the user for a broader grant`,
      });
      return;
    }
    scopes = requested;
  }

  res.json({
    access_token: generateDelegatedToken({
      userId: grant.userId,
      agentId: grant.agentId,
      scopes,
      grantId: grant.id,
    }),
    issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    token_type: 'Bearer',
    expires_in: oauthTokenTtlSeconds(),
    scope: scopes.join(' '),
  });
}

export default router;
