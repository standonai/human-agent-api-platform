import { describe, it, expect } from 'vitest';
import { convertToOpenAI } from './openai-converter.js';
import { GenericToolDefinition } from '../types/tool-definitions.js';

describe('convertToOpenAI', () => {
  it('should convert a simple GET endpoint', () => {
    const tool: GenericToolDefinition = {
      name: 'getUsers',
      description: 'Retrieve a list of users',
      method: 'GET',
      path: '/api/users',
      parameters: {
        query: {
          limit: {
            type: 'integer',
            description: 'Maximum number of results',
            required: false,
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
      },
      responses: {},
    };

    const result = convertToOpenAI(tool);

    expect(result.type).toBe('function');
    expect(result.function.name).toBe('getUsers');
    expect(result.function.description).toContain('GET /api/users');
    expect(result.function.parameters.type).toBe('object');
    expect(result.function.parameters.properties.limit).toBeDefined();
    expect(result.function.parameters.properties.limit.type).toBe('integer');
    expect(result.function.parameters.properties.limit.description).toContain('Maximum number of results');
    expect(result.function.parameters.properties.limit.description).toContain('Range: 1-100');
    expect(result.function.parameters.properties.limit.description).toContain('Default: 20');
  });

  it('should handle required parameters', () => {
    const tool: GenericToolDefinition = {
      name: 'createUser',
      description: 'Create a new user',
      method: 'POST',
      path: '/api/users',
      parameters: {
        body: {
          name: {
            type: 'string',
            description: 'User name',
            required: true,
          },
          email: {
            type: 'string',
            description: 'User email',
            required: true,
            format: 'email',
          },
          age: {
            type: 'integer',
            description: 'User age',
            required: false,
          },
        },
      },
      responses: {},
    };

    const result = convertToOpenAI(tool);

    expect(result.function.parameters.required).toEqual(['name', 'email']);
    expect(result.function.parameters.properties.name).toBeDefined();
    expect(result.function.parameters.properties.email).toBeDefined();
    expect(result.function.parameters.properties.email.description).toContain('Format: email');
  });

  it('should handle enum values', () => {
    const tool: GenericToolDefinition = {
      name: 'filterUsers',
      description: 'Filter users by status',
      method: 'GET',
      path: '/api/users',
      parameters: {
        query: {
          status: {
            type: 'string',
            description: 'User status',
            enum: ['active', 'inactive', 'pending'],
          },
        },
      },
      responses: {},
    };

    const result = convertToOpenAI(tool);

    expect(result.function.parameters.properties.status.enum).toEqual([
      'active',
      'inactive',
      'pending',
    ]);
  });

  it('should handle nested objects', () => {
    const tool: GenericToolDefinition = {
      name: 'updateUser',
      description: 'Update user information',
      method: 'PUT',
      path: '/api/users/{id}',
      parameters: {
        path: {
          id: {
            type: 'string',
            description: 'User ID',
            required: true,
          },
        },
        body: {
          profile: {
            type: 'object',
            description: 'User profile',
            properties: {
              firstName: {
                type: 'string',
                description: 'First name',
                required: true,
              },
              lastName: {
                type: 'string',
                description: 'Last name',
                required: true,
              },
            },
          },
        },
      },
      responses: {},
    };

    const result = convertToOpenAI(tool);

    expect(result.function.parameters.properties.id).toBeDefined();
    expect(result.function.parameters.properties.profile).toBeDefined();
    expect(result.function.parameters.properties.profile.type).toBe('object');
    expect(result.function.parameters.properties.profile.properties).toBeDefined();
    expect(result.function.parameters.properties.profile.properties!.firstName).toBeDefined();
    expect(result.function.parameters.properties.profile.required).toEqual([
      'firstName',
      'lastName',
    ]);
  });

  it('should handle arrays', () => {
    const tool: GenericToolDefinition = {
      name: 'getTags',
      description: 'Get tags',
      method: 'GET',
      path: '/api/tags',
      parameters: {
        query: {
          ids: {
            type: 'array',
            description: 'Tag IDs',
            items: {
              type: 'string',
              description: 'Tag ID',
            },
          },
        },
      },
      responses: {},
    };

    const result = convertToOpenAI(tool);

    expect(result.function.parameters.properties.ids.type).toBe('array');
    expect(result.function.parameters.properties.ids.items).toBeDefined();
    expect(result.function.parameters.properties.ids.items!.type).toBe('string');
  });
});
