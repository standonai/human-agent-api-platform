/**
 * Agent discovery surface: /.well-known/mcp.json and /llms.txt,
 * both generated from the OpenAPI spec so they cannot drift from it.
 */

import { Router, Request, Response } from 'express';
import { getToolCatalog, ToolCatalog } from './tool-catalog.js';

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

export function createDiscoveryRouter(catalogProvider: () => ToolCatalog = getToolCatalog): Router {
  const router = Router();

  router.get('/.well-known/mcp.json', (req: Request, res: Response) => {
    const catalog = catalogProvider();
    res.json({
      name: 'human-agent-api-platform',
      description: catalog.spec.info.description?.split('\n')[0] || catalog.spec.info.title,
      version: catalog.spec.info.version,
      endpoint: `${baseUrl(req)}/mcp`,
      transport: 'streamable-http',
      authentication: {
        schemes: ['bearer', 'agent-key'],
        instructions:
          'Send a user JWT as "Authorization: Bearer <token>" or agent credentials ' +
          'as "X-Agent-ID" + "X-Agent-Key" headers. Register agents via POST /api/agents/register.',
      },
      tool_count: catalog.mcpTools.length,
      docs: `${baseUrl(req)}/llms.txt`,
    });
  });

  router.get('/llms.txt', (req: Request, res: Response) => {
    const catalog = catalogProvider();
    res.type('text/plain').send(renderLlmsTxt(catalog, baseUrl(req)));
  });

  // OAuth metadata (MCP authorization spec): where the token endpoint
  // lives and how this resource expects to be called.
  router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const base = baseUrl(req);
    res.json({
      resource: base,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
      scopes_supported: ['tasks:read', 'tasks:write', 'profile:read'],
      resource_documentation: `${base}/llms.txt`,
    });
  });

  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const base = baseUrl(req);
    res.json({
      issuer: base,
      token_endpoint: `${base}/oauth/token`,
      grant_types_supported: [
        'client_credentials',
        'urn:ietf:params:oauth:grant-type:token-exchange',
      ],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      scopes_supported: ['tasks:read', 'tasks:write', 'profile:read'],
      response_types_supported: [],
    });
  });

  return router;
}

export function renderLlmsTxt(catalog: ToolCatalog, base: string): string {
  const { spec } = catalog;
  const lines: string[] = [];

  lines.push(`# ${spec.info.title}`);
  lines.push('');
  if (spec.info.description) {
    lines.push(`> ${spec.info.description.trim().split('\n')[0]}`);
    lines.push('');
  }

  lines.push('## Connecting');
  lines.push('');
  lines.push(`- MCP endpoint (streamable HTTP): ${base}/mcp`);
  lines.push(`- MCP metadata: ${base}/.well-known/mcp.json`);
  lines.push(`- OpenAPI spec: ${base}/api (see repository specs/openapi/platform-api.yaml)`);
  lines.push('- Auth: "Authorization: Bearer <JWT>" (users). Agents: exchange X-Agent credentials');
  lines.push(`  for a token at ${base}/oauth/token (grant_type=client_credentials).`);
  lines.push('- Acting for a user: the user creates a delegation grant (POST /api/delegations),');
  lines.push('  then exchange your agent token for a delegated token');
  lines.push('  (grant_type=urn:ietf:params:oauth:grant-type:token-exchange).');
  lines.push(`- OAuth metadata: ${base}/.well-known/oauth-authorization-server`);
  lines.push('- Errors always include a `suggestion` field — follow it to self-correct.');
  lines.push('- Mutations accept `dry_run=true` to validate without executing.');
  lines.push('- Mutations accept `require_approval=true` to capture the change for human');
  lines.push('  approval (202 + approval_id); stream `/api/approvals/{id}/events` (SSE) to');
  lines.push('  learn the outcome without polling.');
  lines.push('- Send an `Idempotency-Key` header on mutations to make retries safe; replays');
  lines.push('  return the stored response with `Idempotency-Replayed: true`.');
  lines.push('');

  lines.push('## Tools');
  lines.push('');
  for (const tool of catalog.mcpTools) {
    const generic = catalog.generic.get(tool.name);
    const summary = tool.description.split('\n').find((l) => l && !l.startsWith(generic?.method || '')) ||
      tool.description.split('\n')[0];
    lines.push(`- ${tool.name} (${generic?.method} ${generic?.path}): ${summary.trim()}`);
  }
  lines.push('');

  return lines.join('\n');
}
