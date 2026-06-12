/**
 * Convert generic tool definitions to MCP (Model Context Protocol) tools.
 *
 * OpenAPI metadata maps onto MCP tool annotations so clients can reason
 * about safety before calling:
 *   GET            → readOnlyHint
 *   DELETE         → destructiveHint
 *   PUT            → idempotentHint
 * Every mutating tool gains an optional `dry_run` input that maps to the
 * platform-wide `?dry_run=true` validation mode.
 */

import { GenericToolDefinition, ParameterDefinition } from '../types/tool-definitions.js';

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpJsonSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: McpJsonSchema;
  properties?: Record<string, McpJsonSchema>;
  required?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  examples?: unknown[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, McpJsonSchema>;
    required?: string[];
  };
  annotations: McpToolAnnotations;
  /** Where each input maps on the HTTP request (used by the dispatcher). */
  argTargets: Record<string, 'path' | 'query' | 'body'>;
}

export const DRY_RUN_PARAM = 'dry_run';
export const REQUIRE_APPROVAL_PARAM = 'require_approval';

/**
 * Convert a generic tool definition to an MCP tool.
 */
export function convertToMcp(tool: GenericToolDefinition): McpToolDefinition {
  const properties: Record<string, McpJsonSchema> = {};
  const required: string[] = [];
  const argTargets: McpToolDefinition['argTargets'] = {};

  const groups: Array<['path' | 'query' | 'body', Record<string, ParameterDefinition> | undefined]> = [
    ['path', tool.parameters.path],
    ['query', tool.parameters.query],
    ['body', tool.parameters.body],
  ];

  for (const [target, params] of groups) {
    for (const [name, param] of Object.entries(params || {})) {
      properties[name] = convertParameter(param);
      argTargets[name] = target;
      // Path parameters are always required to build the URL.
      if (param.required || target === 'path') {
        required.push(name);
      }
    }
  }

  const isMutation = tool.method !== 'GET';
  if (isMutation && !properties[DRY_RUN_PARAM]) {
    properties[DRY_RUN_PARAM] = {
      type: 'boolean',
      description:
        'Validate the request without executing it. Returns what would happen. ' +
        'Use this to preview a mutation before committing.',
      default: false,
    };
    argTargets[DRY_RUN_PARAM] = 'query';
  }
  if (isMutation && !properties[REQUIRE_APPROVAL_PARAM]) {
    properties[REQUIRE_APPROVAL_PARAM] = {
      type: 'boolean',
      description:
        'Capture this change for human approval instead of executing. ' +
        'Returns 202 with approval_id, status_url, and an SSE events_url; ' +
        'the change runs only after the owning user approves it.',
      default: false,
    };
    argTargets[REQUIRE_APPROVAL_PARAM] = 'query';
  }

  let description = tool.description.trim();
  if (!description.includes(tool.method)) {
    description = `${tool.method} ${tool.path}\n\n${description}`;
  }
  if (isMutation) {
    description += `\n\nSupports ${DRY_RUN_PARAM}=true to validate without executing.`;
  }

  const inputSchema: McpToolDefinition['inputSchema'] = {
    type: 'object',
    properties,
  };
  if (required.length > 0) {
    inputSchema.required = required;
  }

  return {
    name: tool.name,
    description,
    inputSchema,
    annotations: buildAnnotations(tool),
    argTargets,
  };
}

function buildAnnotations(tool: GenericToolDefinition): McpToolAnnotations {
  const annotations: McpToolAnnotations = {
    title: tool.name,
    readOnlyHint: tool.method === 'GET',
    // This server only talks to its own API, not the open web.
    openWorldHint: false,
  };

  if (tool.method === 'DELETE') {
    annotations.destructiveHint = true;
  }
  if (tool.method === 'PUT' || tool.method === 'DELETE') {
    annotations.idempotentHint = true;
  }

  return annotations;
}

function convertParameter(param: ParameterDefinition): McpJsonSchema {
  const schema: McpJsonSchema = {
    type: normalizeType(param.type),
    description: buildDescription(param),
  };

  if (param.enum) schema.enum = param.enum;
  if (param.format) schema.format = param.format;
  if (param.minimum !== undefined) schema.minimum = param.minimum;
  if (param.maximum !== undefined) schema.maximum = param.maximum;
  if (param.default !== undefined) schema.default = param.default;
  if (param.example !== undefined) schema.examples = [param.example];
  if (param.items) schema.items = convertParameter(param.items);

  if (param.properties) {
    schema.properties = {};
    const required: string[] = [];
    for (const [name, prop] of Object.entries(param.properties)) {
      schema.properties[name] = convertParameter(prop);
      if (prop.required) required.push(name);
    }
    if (required.length > 0) schema.required = required;
  }

  return schema;
}

function normalizeType(type: string): string {
  const valid = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
  return valid.includes(type) ? type : 'string';
}

function buildDescription(param: ParameterDefinition): string {
  let desc = param.description || '';
  const details: string[] = [];

  if (param.minimum !== undefined && param.maximum !== undefined) {
    details.push(`Range: ${param.minimum}-${param.maximum}`);
  }
  if (param.example !== undefined) {
    details.push(`Example: ${JSON.stringify(param.example)}`);
  }

  if (details.length > 0) {
    desc += (desc ? '. ' : '') + details.join('. ');
  }
  return desc;
}

/**
 * Convert multiple tools to MCP format.
 */
export function convertMultipleToMcp(tools: GenericToolDefinition[]): McpToolDefinition[] {
  return tools.map(convertToMcp);
}
