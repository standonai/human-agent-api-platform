/**
 * MCP tool catalog
 *
 * Loads the platform's own OpenAPI spec and generates the MCP tool surface
 * from it. The spec is the single source of truth: anything documented
 * becomes a tool, anything undocumented does not exist.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as loadYaml } from 'js-yaml';
import { parseOpenAPISpec, OpenAPISpec } from '../tools/openapi-parser.js';
import { convertMultipleToMcp, McpToolDefinition } from '../tools/mcp-converter.js';
import { GenericToolDefinition } from '../types/tool-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ToolCatalog {
  spec: OpenAPISpec;
  /** Generic definitions (method/path/params) keyed by tool name. */
  generic: Map<string, GenericToolDefinition>;
  /** MCP-format tools, same order as the spec. */
  mcpTools: McpToolDefinition[];
}

function defaultSpecPath(): string {
  // Works from both src/ (tsx) and dist/ (build): specs/ is a sibling.
  return process.env.OPENAPI_SPEC_PATH || join(__dirname, '../../specs/openapi/platform-api.yaml');
}

/**
 * Tags excluded from the MCP surface by default. Admin/ops endpoints are
 * still available over REST with proper credentials; they are not useful
 * as agent tools and would bloat every client's context window.
 */
const DEFAULT_EXCLUDED_TAGS = new Set(['audit', 'secrets', 'monitoring', 'agents', 'mcp', 'oauth']);

function tagFilter(): (tool: GenericToolDefinition) => boolean {
  const include = process.env.MCP_TOOL_TAGS?.split(',').map((t) => t.trim()).filter(Boolean);
  if (include && include.length > 0) {
    const allowed = new Set(include);
    return (tool) => (tool.tags || []).some((t) => allowed.has(t));
  }
  return (tool) => !(tool.tags || []).some((t) => DEFAULT_EXCLUDED_TAGS.has(t));
}

let cached: ToolCatalog | null = null;

export function loadToolCatalog(specPath?: string): ToolCatalog {
  const path = specPath || defaultSpecPath();
  const spec = loadYaml(readFileSync(path, 'utf-8')) as OpenAPISpec;

  const generic = parseOpenAPISpec(spec).filter(tagFilter());
  const mcpTools = convertMultipleToMcp(generic);

  return {
    spec,
    generic: new Map(generic.map((t) => [t.name, t])),
    mcpTools,
  };
}

export function getToolCatalog(): ToolCatalog {
  if (!cached) {
    cached = loadToolCatalog();
  }
  return cached;
}

/** Test hook. */
export function resetToolCatalog(): void {
  cached = null;
}
