/**
 * Convert OpenAPI schemas to Zod schemas for runtime validation
 */

import { z } from 'zod';

interface OpenAPISchema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: any;
  nullable?: boolean;
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  $ref?: string;
}

interface ConversionContext {
  schemas?: Record<string, OpenAPISchema>;
}

/**
 * Convert OpenAPI schema to Zod schema
 */
export function openAPIToZod(
  schema: OpenAPISchema,
  context: ConversionContext = {}
): z.ZodTypeAny {
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    if (refName && context.schemas?.[refName]) {
      return openAPIToZod(context.schemas[refName], context);
    }
    throw new Error(`Cannot resolve $ref: ${schema.$ref}`);
  }

  // Handle nullable
  let zodSchema: z.ZodTypeAny;

  // Handle composition (oneOf, anyOf, allOf)
  if (schema.oneOf) {
    const schemas = schema.oneOf.map(s => openAPIToZod(s, context));
    zodSchema = z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  } else if (schema.anyOf) {
    const schemas = schema.anyOf.map(s => openAPIToZod(s, context));
    zodSchema = z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  } else if (schema.allOf) {
    // For allOf, merge all schemas (simplified - real implementation would be more complex)
    const baseSchema = schema.allOf[0];
    zodSchema = openAPIToZod(baseSchema, context);
  } else {
    zodSchema = convertBasicType(schema, context);
  }

  // Handle nullable
  if (schema.nullable) {
    zodSchema = zodSchema.nullable();
  }

  // Add description
  if (schema.description) {
    zodSchema = zodSchema.describe(schema.description);
  }

  return zodSchema;
}

function convertBasicType(
  schema: OpenAPISchema,
  context: ConversionContext
): z.ZodTypeAny {
  const type = schema.type || 'string';

  switch (type) {
    case 'string':
      return convertString(schema);

    case 'number':
    case 'integer':
      return convertNumber(schema, type === 'integer');

    case 'boolean':
      return z.boolean();

    case 'array':
      return convertArray(schema, context);

    case 'object':
      return convertObject(schema, context);

    case 'null':
      return z.null();

    default:
      return z.any();
  }
}

function convertString(schema: OpenAPISchema): z.ZodString | z.ZodEnum<[string, ...string[]]> {
  let zodSchema = z.string();

  // Handle enum
  if (schema.enum) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  // Handle format
  if (schema.format) {
    switch (schema.format) {
      case 'email':
        zodSchema = zodSchema.email();
        break;
      case 'uri':
      case 'url':
        zodSchema = zodSchema.url();
        break;
      case 'uuid':
        zodSchema = zodSchema.uuid();
        break;
      case 'date':
      case 'date-time':
        // Validate ISO 8601 date strings
        zodSchema = zodSchema.datetime();
        break;
    }
  }

  // Handle pattern
  if (schema.pattern) {
    zodSchema = zodSchema.regex(new RegExp(schema.pattern));
  }

  // Handle length constraints
  if (schema.minLength !== undefined) {
    zodSchema = zodSchema.min(schema.minLength);
  }
  if (schema.maxLength !== undefined) {
    zodSchema = zodSchema.max(schema.maxLength);
  }

  return zodSchema;
}

function convertNumber(schema: OpenAPISchema, isInteger: boolean): z.ZodNumber {
  let zodSchema = z.number();

  if (isInteger) {
    zodSchema = zodSchema.int();
  }

  if (schema.minimum !== undefined) {
    zodSchema = zodSchema.min(schema.minimum);
  }
  if (schema.maximum !== undefined) {
    zodSchema = zodSchema.max(schema.maximum);
  }

  return zodSchema;
}

function convertArray(
  schema: OpenAPISchema,
  context: ConversionContext
): z.ZodArray<any> {
  if (!schema.items) {
    return z.array(z.any());
  }

  const itemSchema = openAPIToZod(schema.items, context);
  return z.array(itemSchema);
}

function convertObject(
  schema: OpenAPISchema,
  context: ConversionContext
): z.ZodObject<any> {
  if (!schema.properties) {
    return z.object({}).passthrough();
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  const required = schema.required || [];

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    let propZodSchema = openAPIToZod(propSchema, context);

    // Make optional if not in required array
    if (!required.includes(key)) {
      propZodSchema = propZodSchema.optional();
    }

    // Add default value
    if (propSchema.default !== undefined) {
      propZodSchema = propZodSchema.default(propSchema.default);
    }

    shape[key] = propZodSchema;
  }

  return z.object(shape);
}

/**
 * Create a validator from OpenAPI parameter definitions
 */
export function createParameterValidator(parameters: any[]): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const param of parameters) {
    if (!param.schema) continue;

    let zodSchema = openAPIToZod(param.schema);

    // Make optional if not required
    if (!param.required) {
      zodSchema = zodSchema.optional();
    }

    shape[param.name] = zodSchema;
  }

  return z.object(shape);
}

/**
 * Create a validator from OpenAPI request body
 */
export function createBodyValidator(
  requestBody: any,
  context: ConversionContext = {}
): z.ZodTypeAny {
  const jsonSchema = requestBody?.content?.['application/json']?.schema;

  if (!jsonSchema) {
    return z.object({});
  }

  return openAPIToZod(jsonSchema, context);
}
