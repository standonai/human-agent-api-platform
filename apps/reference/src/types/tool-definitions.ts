/**
 * Type definitions for AI agent tool formats
 */

/**
 * Generic tool definition that can be converted to any format
 */
export interface GenericToolDefinition {
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  tags?: string[];
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
