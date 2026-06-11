/**
 * Convert generic tool definitions to Anthropic Claude tool format
 */

import { GenericToolDefinition, AnthropicTool, AnthropicParameter } from '../types/tool-definitions.js';

/**
 * Convert generic tool definition to Anthropic format
 */
export function convertToAnthropic(tool: GenericToolDefinition): AnthropicTool {
  const input_schema: AnthropicTool['input_schema'] = {
    type: 'object',
    properties: {},
    required: [],
  };

  // Combine all parameters into a flat structure for Anthropic
  const allParams = {
    ...tool.parameters.path,
    ...tool.parameters.query,
    ...tool.parameters.body,
  };

  for (const [name, param] of Object.entries(allParams)) {
    input_schema.properties[name] = convertParameterToAnthropic(param);

    if (param.required) {
      input_schema.required!.push(name);
    }
  }

  // Remove required array if empty
  if (input_schema.required!.length === 0) {
    delete input_schema.required;
  }

  // Build description with method and path info
  let description = tool.description;
  if (!description.includes(tool.method)) {
    description = `${tool.method} ${tool.path}\n\n${description}`;
  }

  return {
    name: tool.name,
    description: description.trim(),
    input_schema,
  };
}

/**
 * Convert parameter definition to Anthropic parameter format
 */
function convertParameterToAnthropic(param: any): AnthropicParameter {
  const anthropicParam: AnthropicParameter = {
    type: mapTypeToAnthropic(param.type),
    description: buildParameterDescription(param),
  };

  if (param.enum) {
    anthropicParam.enum = param.enum;
  }

  if (param.items) {
    anthropicParam.items = convertParameterToAnthropic(param.items);
  }

  if (param.properties) {
    anthropicParam.properties = {};
    anthropicParam.required = [];

    for (const [propName, propDef] of Object.entries(param.properties)) {
      anthropicParam.properties[propName] = convertParameterToAnthropic(propDef);

      if ((propDef as any).required) {
        anthropicParam.required!.push(propName);
      }
    }

    if (anthropicParam.required!.length === 0) {
      delete anthropicParam.required;
    }
  }

  return anthropicParam;
}

/**
 * Map generic type to Anthropic type
 */
function mapTypeToAnthropic(type: string): AnthropicParameter['type'] {
  const typeMap: Record<string, AnthropicParameter['type']> = {
    'string': 'string',
    'number': 'number',
    'integer': 'integer',
    'boolean': 'boolean',
    'array': 'array',
    'object': 'object',
  };

  return typeMap[type] || 'string';
}

/**
 * Build enriched parameter description
 */
function buildParameterDescription(param: any): string {
  let desc = param.description || '';

  const details: string[] = [];

  if (param.format) {
    details.push(`Format: ${param.format}`);
  }

  if (param.minimum !== undefined || param.maximum !== undefined) {
    if (param.minimum !== undefined && param.maximum !== undefined) {
      details.push(`Range: ${param.minimum}-${param.maximum}`);
    } else if (param.minimum !== undefined) {
      details.push(`Minimum: ${param.minimum}`);
    } else if (param.maximum !== undefined) {
      details.push(`Maximum: ${param.maximum}`);
    }
  }

  if (param.default !== undefined) {
    details.push(`Default: ${param.default}`);
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
 * Convert multiple tools to Anthropic format
 */
export function convertMultipleToAnthropic(tools: GenericToolDefinition[]): AnthropicTool[] {
  return tools.map(convertToAnthropic);
}
