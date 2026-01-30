/**
 * Type definitions for AI agent tool formats
 */

/**
 * OpenAI Function Calling format
 * https://platform.openai.com/docs/guides/function-calling
 */
export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, OpenAIParameter>;
    required?: string[];
  };
}

export interface OpenAIParameter {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: OpenAIParameter;
  properties?: Record<string, OpenAIParameter>;
  required?: string[];
}

export interface OpenAITool {
  type: 'function';
  function: OpenAIFunction;
}

/**
 * Anthropic Claude Tool format
 * https://docs.anthropic.com/claude/docs/tool-use
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, AnthropicParameter>;
    required?: string[];
  };
}

export interface AnthropicParameter {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: AnthropicParameter;
  properties?: Record<string, AnthropicParameter>;
  required?: string[];
}

/**
 * Generic tool definition that can be converted to any format
 */
export interface GenericToolDefinition {
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  parameters: {
    path?: Record<string, ParameterDefinition>;
    query?: Record<string, ParameterDefinition>;
    header?: Record<string, ParameterDefinition>;
    body?: Record<string, ParameterDefinition>;
  };
  responses: Record<string, ResponseDefinition>;
}

export interface ParameterDefinition {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
  example?: any;
  default?: any;
  format?: string;
  minimum?: number;
  maximum?: number;
  items?: ParameterDefinition;
  properties?: Record<string, ParameterDefinition>;
}

export interface ResponseDefinition {
  description: string;
  schema?: any;
}
