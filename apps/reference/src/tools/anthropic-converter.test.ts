import { describe, it, expect } from 'vitest';
import { convertToAnthropic } from './anthropic-converter.js';
import { GenericToolDefinition } from '../types/tool-definitions.js';

describe('convertToAnthropic', () => {
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

    const result = convertToAnthropic(tool);

    expect(result.name).toBe('getUsers');
    expect(result.description).toContain('GET /api/users');
    expect(result.input_schema.type).toBe('object');
    expect(result.input_schema.properties.limit).toBeDefined();
    expect(result.input_schema.properties.limit.type).toBe('integer');
    expect(result.input_schema.properties.limit.description).toContain('Maximum number of results');
    expect(result.input_schema.properties.limit.description).toContain('Range: 1-100');
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
          },
        },
      },
      responses: {},
    };

    const result = convertToAnthropic(tool);

    expect(result.input_schema.required).toEqual(['name', 'email']);
    expect(result.input_schema.properties.name).toBeDefined();
    expect(result.input_schema.properties.email).toBeDefined();
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

    const result = convertToAnthropic(tool);

    expect(result.input_schema.properties.status.enum).toEqual([
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

    const result = convertToAnthropic(tool);

    expect(result.input_schema.properties.id).toBeDefined();
    expect(result.input_schema.properties.profile).toBeDefined();
    expect(result.input_schema.properties.profile.type).toBe('object');
    expect(result.input_schema.properties.profile.properties).toBeDefined();
    expect(result.input_schema.properties.profile.properties!.firstName).toBeDefined();
    expect(result.input_schema.properties.profile.required).toEqual([
      'firstName',
      'lastName',
    ]);
  });
});
