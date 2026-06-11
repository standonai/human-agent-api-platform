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
  lines.push('- Auth: "Authorization: Bearer <JWT>" (users) or "X-Agent-ID" + "X-Agent-Key" (agents)');
  lines.push('- Errors always include a `suggestion` field — follow it to self-correct.');
  lines.push('- Mutations accept `dry_run=true` to validate without executing.');
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
