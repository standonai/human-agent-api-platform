/**
 * OpenAPI 3.1 Parser
 * Extracts tool definitions from OpenAPI specifications
 */

import { GenericToolDefinition, ParameterDefinition } from '../types/tool-definitions.js';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, any>;
  };
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: Parameter[];
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  tags?: string[];
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: Schema;
  example?: any;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema?: Schema;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

export interface Schema {
  type?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: any[];
  items?: Schema;
  format?: string;
  minimum?: number;
  maximum?: number;
  default?: any;
  example?: any;
  $ref?: string;
}

/**
 * Parse OpenAPI spec and extract tool definitions
 */
export function parseOpenAPISpec(spec: OpenAPISpec): GenericToolDefinition[] {
  const tools: GenericToolDefinition[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tool = extractToolFromOperation(path, method, operation, pathItem, spec);
      tools.push(tool);
    }
  }

  return tools;
}

/**
 * Extract tool definition from OpenAPI operation
 */
function extractToolFromOperation(
  path: string,
  method: string,
  operation: Operation,
  pathItem: PathItem,
  spec: OpenAPISpec
): GenericToolDefinition {
  const name = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
  const description = operation.description || operation.summary || `${method} ${path}`;

  // Combine path-level and operation-level parameters
  const allParameters = [
    ...(pathItem.parameters || []),
    ...(operation.parameters || []),
  ];

  const parameters: GenericToolDefinition['parameters'] = {
    path: {},
    query: {},
    header: {},
    body: {},
  };

  // Process parameters
  for (const param of allParameters) {
    const paramDef = convertParameter(param, spec);

    switch (param.in) {
      case 'path':
        parameters.path![param.name] = paramDef;
        break;
      case 'query':
        parameters.query![param.name] = paramDef;
        break;
      case 'header':
        parameters.header![param.name] = paramDef;
        break;
    }
  }

  // Process request body
  if (operation.requestBody?.content?.['application/json']?.schema) {
    const schema = operation.requestBody.content['application/json'].schema;
    const bodyParams = convertSchema(schema, spec);

    if (bodyParams.properties) {
      parameters.body = bodyParams.properties;
    }
  }

  // Process responses
  const responses: Record<string, any> = {};
  if (operation.responses) {
    for (const [code, response] of Object.entries(operation.responses)) {
      responses[code] = {
        description: response.description,
        schema: response.content?.['application/json']?.schema,
      };
    }
  }

  return {
    name,
    description,
    method: method.toUpperCase() as any,
    path,
    parameters,
    responses,
  };
}

/**
 * Convert OpenAPI parameter to generic parameter definition
 */
function convertParameter(param: Parameter, _spec: OpenAPISpec): ParameterDefinition {
  const schema = param.schema || {};

  return {
    type: schema.type || 'string',
    description: param.description || '',
    required: param.required,
    enum: schema.enum,
    example: param.example || schema.example,
    default: schema.default,
    format: schema.format,
    minimum: schema.minimum,
    maximum: schema.maximum,
  };
}

/**
 * Convert OpenAPI schema to parameter definition
 */
function convertSchema(schema: Schema, spec: OpenAPISpec): ParameterDefinition {
  // Handle $ref
  if (schema.$ref) {
    const refSchema = resolveRef(schema.$ref, spec);
    if (refSchema) {
      return convertSchema(refSchema, spec);
    }
  }

  const def: ParameterDefinition = {
    type: schema.type || 'object',
    description: schema.description || '',
  };

  if (schema.enum) def.enum = schema.enum;
  if (schema.example) def.example = schema.example;
  if (schema.default) def.default = schema.default;
  if (schema.format) def.format = schema.format;
  if (schema.minimum !== undefined) def.minimum = schema.minimum;
  if (schema.maximum !== undefined) def.maximum = schema.maximum;

  if (schema.properties) {
    def.properties = {};
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      def.properties[propName] = convertSchema(propSchema, spec);
    }
  }

  if (schema.required) {
    def.required = true;
  }

  if (schema.items) {
    def.items = convertSchema(schema.items, spec);
  }

  return def;
}

/**
 * Resolve $ref reference in OpenAPI spec
 */
function resolveRef(ref: string, spec: OpenAPISpec): Schema | null {
  // Handle #/components/schemas/SchemaName format
  const match = ref.match(/^#\/components\/schemas\/(.+)$/);
  if (match && spec.components?.schemas) {
    return spec.components.schemas[match[1]] || null;
  }
  return null;
}
