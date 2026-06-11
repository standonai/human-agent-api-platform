/**
 * MCP server endpoint (streamable HTTP transport, stateless mode)
 *
 * Mounted at /mcp. Each POST is a self-contained JSON-RPC exchange: a fresh
 * Server + transport pair per request, so there is no session state to leak
 * between clients and the endpoint scales horizontally.
 *
 * Tools are generated from the platform's OpenAPI spec (see tool-catalog.ts)
 * and dispatched as real HTTP calls through the full middleware stack.
 */

import { Router, Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode } from '../types/errors.js';
import { ToolCatalog, getToolCatalog } from './tool-catalog.js';
import { ApiExecutor, buildApiCall, pickForwardedHeaders } from './executor.js';

export interface McpRouterOptions {
  executor: ApiExecutor;
  catalog?: ToolCatalog;
  serverName?: string;
  serverVersion?: string;
}

function buildMcpServer(options: McpRouterOptions, req: Request): Server {
  const catalog = options.catalog || getToolCatalog();
  const forwardedHeaders = pickForwardedHeaders(req.headers);

  const server = new Server(
    {
      name: options.serverName || 'human-agent-api-platform',
      version: options.serverVersion || '0.1.0',
    },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: catalog.mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;

    const generic = catalog.generic.get(toolName);
    const mcpTool = catalog.mcpTools.find((t) => t.name === toolName);
    if (!generic || !mcpTool) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: {
              code: 'UNKNOWN_TOOL',
              message: `Tool '${toolName}' does not exist`,
              suggestion: 'Call tools/list to discover available tools',
            },
          }),
        }],
        isError: true,
      };
    }

    const call = buildApiCall(generic, mcpTool, args, forwardedHeaders);

    const unresolved = call.path.match(/\{([^}]+)\}/g);
    if (unresolved) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: {
              code: 'MISSING_REQUIRED_FIELD',
              message: `Missing required path parameter(s): ${unresolved.join(', ')}`,
              suggestion:
                `Provide ${unresolved.map((p) => p.slice(1, -1)).join(', ')} in the tool arguments ` +
                '(see the tool inputSchema for exact names)',
            },
          }),
        }],
        isError: true,
      };
    }

    const result = await options.executor(call);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ status: result.status, body: result.body }),
      }],
      isError: result.status >= 400,
    };
  });

  return server;
}

export function createMcpRouter(options: McpRouterOptions): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const server = buildMcpServer(options, req);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: (error as Error).message },
          id: null,
        });
      }
    }
  });

  // Stateless mode: no SSE streams or sessions to resume/terminate.
  const methodNotAllowed = (req: Request, res: Response): void => {
    res.status(405).json({
      error: {
        code: ErrorCode.INVALID_PARAMETER,
        message: `${req.method} is not supported on /mcp (stateless streamable HTTP)`,
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'METHOD_NOT_ALLOWED',
          message: 'This MCP endpoint is stateless and only accepts POST',
          suggestion: 'Send JSON-RPC messages via POST /mcp',
        }],
      },
    });
  };
  router.get('/', methodNotAllowed);
  router.delete('/', methodNotAllowed);

  return router;
}
