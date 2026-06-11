/**
 * Convert generic tool definitions to OpenAI function calling format
 */

import { GenericToolDefinition, OpenAITool, OpenAIFunction, OpenAIParameter } from '../types/tool-definitions.js';

/**
 * Convert generic tool definition to OpenAI format
 */
export function convertToOpenAI(tool: GenericToolDefinition): OpenAITool {
  const parameters: OpenAIFunction['parameters'] = {
    type: 'object',
    properties: {},
    required: [],
  };

  // Combine all parameters into a flat structure for OpenAI
  const allParams = {
    ...tool.parameters.path,
    ...tool.parameters.query,
    ...tool.parameters.body,
  };

  for (const [name, param] of Object.entries(allParams)) {
    parameters.properties[name] = convertParameterToOpenAI(param);

    if (param.required) {
      parameters.required!.push(name);
    }
  }

  // Remove required array if empty
  if (parameters.required!.length === 0) {
    delete parameters.required;
  }

  // Build description with method and path info
  let description = tool.description;
  if (!description.includes(tool.method)) {
    description = `${tool.method} ${tool.path}\n\n${description}`;
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: description.trim(),
      parameters,
    },
  };
}

/**
 * Convert parameter definition to OpenAI parameter format
 */
function convertParameterToOpenAI(param: any): OpenAIParameter {
  const openAIParam: OpenAIParameter = {
    type: mapTypeToOpenAI(param.type),
    description: buildParameterDescription(param),
  };

  if (param.enum) {
    openAIParam.enum = param.enum;
  }

  if (param.items) {
    openAIParam.items = convertParameterToOpenAI(param.items);
  }

  if (param.properties) {
    openAIParam.properties = {};
    openAIParam.required = [];

    for (const [propName, propDef] of Object.entries(param.properties)) {
      openAIParam.properties[propName] = convertParameterToOpenAI(propDef);

      if ((propDef as any).required) {
        openAIParam.required!.push(propName);
      }
    }

    if (openAIParam.required!.length === 0) {
      delete openAIParam.required;
    }
  }

  return openAIParam;
}

/**
 * Map generic type to OpenAI type
 */
function mapTypeToOpenAI(type: string): OpenAIParameter['type'] {
  const typeMap: Record<string, OpenAIParameter['type']> = {
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
 * Convert multiple tools to OpenAI format
 */
export function convertMultipleToOpenAI(tools: GenericToolDefinition[]): OpenAITool[] {
  return tools.map(convertToOpenAI);
}
