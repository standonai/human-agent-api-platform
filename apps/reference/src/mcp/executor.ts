/**
 * MCP → REST dispatch
 *
 * An MCP tool call becomes a real HTTP request against this platform's own
 * API. Going through the full stack (auth, rate limiting, sanitization,
 * dry-run, metrics, audit) is deliberate: the MCP surface must never be a
 * side door with different semantics than REST.
 */

import { GenericToolDefinition } from '../types/tool-definitions.js';
import { McpToolDefinition } from '../tools/mcp-converter.js';

export interface ApiCall {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

export type ApiExecutor = (call: ApiCall) => Promise<ApiResult>;

/** Credentials and context headers forwarded from the MCP request. */
const FORWARDED_HEADERS = ['authorization', 'x-agent-id', 'x-agent-key', 'api-version'];

export function pickForwardedHeaders(
  incoming: Record<string, string | string[] | undefined>
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = incoming[name];
    if (typeof value === 'string') {
      headers[name] = value;
    }
  }
  return headers;
}

/**
 * Map validated tool arguments onto an HTTP request using the converter's
 * argTargets (path substitution, query string, JSON body).
 */
export function buildApiCall(
  generic: GenericToolDefinition,
  mcpTool: McpToolDefinition,
  args: Record<string, unknown>,
  headers: Record<string, string>
): ApiCall {
  let path = generic.path;
  const query: Record<string, string> = {};
  const body: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    const target = mcpTool.argTargets[name];
    switch (target) {
      case 'path':
        path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
        break;
      case 'query':
        query[name] = String(value);
        break;
      case 'body':
        body[name] = value;
        break;
      default:
        // Unknown args are dropped rather than smuggled into the request.
        break;
    }
  }

  return {
    method: generic.method,
    path,
    query,
    headers,
    body: Object.keys(body).length > 0 ? body : undefined,
  };
}

/**
 * Default executor: loopback HTTP against this server's own listen address.
 */
export function createLoopbackExecutor(baseUrl: string): ApiExecutor {
  return async (call: ApiCall): Promise<ApiResult> => {
    const url = new URL(call.path, baseUrl);
    for (const [key, value] of Object.entries(call.query)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: call.method,
      headers: {
        'content-type': 'application/json',
        ...call.headers,
      },
      body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return { status: response.status, body };
  };
}
