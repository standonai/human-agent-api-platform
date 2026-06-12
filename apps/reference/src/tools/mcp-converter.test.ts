import { describe, it, expect } from 'vitest';
import { convertToMcp, DRY_RUN_PARAM } from './mcp-converter.js';
import { GenericToolDefinition } from '../types/tool-definitions.js';

function makeTool(overrides: Partial<GenericToolDefinition>): GenericToolDefinition {
  return {
    name: 'testTool',
    description: 'A test tool',
    method: 'GET',
    path: '/api/things',
    parameters: {},
    responses: {},
    ...overrides,
  };
}

describe('convertToMcp', () => {
  it('marks GET tools read-only and adds no dry_run', () => {
    const mcp = convertToMcp(makeTool({ method: 'GET' }));

    expect(mcp.annotations.readOnlyHint).toBe(true);
    expect(mcp.annotations.destructiveHint).toBeUndefined();
    expect(mcp.inputSchema.properties[DRY_RUN_PARAM]).toBeUndefined();
  });

  it('marks DELETE tools destructive and idempotent', () => {
    const mcp = convertToMcp(makeTool({ method: 'DELETE', path: '/api/things/{id}' }));

    expect(mcp.annotations.readOnlyHint).toBe(false);
    expect(mcp.annotations.destructiveHint).toBe(true);
    expect(mcp.annotations.idempotentHint).toBe(true);
  });

  it('adds dry_run and require_approval inputs to every mutation', () => {
    const mcp = convertToMcp(makeTool({ method: 'POST' }));

    expect(mcp.inputSchema.properties[DRY_RUN_PARAM]).toMatchObject({ type: 'boolean' });
    expect(mcp.argTargets[DRY_RUN_PARAM]).toBe('query');
    expect(mcp.description).toContain('dry_run=true');
    expect(mcp.inputSchema.properties.require_approval).toMatchObject({ type: 'boolean' });
    expect(mcp.argTargets.require_approval).toBe('query');
  });

  it('flattens path/query/body params and requires path params', () => {
    const mcp = convertToMcp(makeTool({
      method: 'PUT',
      path: '/api/things/{id}',
      parameters: {
        path: { id: { type: 'string', description: 'Thing id' } },
        query: { verbose: { type: 'boolean', description: '' } },
        body: {
          title: { type: 'string', description: 'Title', required: true },
          note: { type: 'string', description: '' },
        },
      },
    }));

    expect(Object.keys(mcp.inputSchema.properties).sort()).toEqual(
      ['dry_run', 'id', 'note', 'require_approval', 'title', 'verbose']
    );
    expect(mcp.inputSchema.required).toContain('id');
    expect(mcp.inputSchema.required).toContain('title');
    expect(mcp.inputSchema.required).not.toContain('note');
    expect(mcp.argTargets).toMatchObject({
      id: 'path',
      verbose: 'query',
      title: 'body',
      note: 'body',
    });
  });

  it('keeps enum, range, and example metadata', () => {
    const mcp = convertToMcp(makeTool({
      parameters: {
        query: {
          status: { type: 'string', description: 'Status', enum: ['todo', 'done'] },
          limit: { type: 'integer', description: 'Page size', minimum: 1, maximum: 100, example: 20 },
        },
      },
    }));

    expect(mcp.inputSchema.properties.status.enum).toEqual(['todo', 'done']);
    expect(mcp.inputSchema.properties.limit).toMatchObject({ minimum: 1, maximum: 100 });
    expect(mcp.inputSchema.properties.limit.description).toContain('Range: 1-100');
  });
});
