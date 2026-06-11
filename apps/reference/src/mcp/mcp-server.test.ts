/**
 * MCP end-to-end: JSON-RPC over streamable HTTP → tool dispatch → a real
 * Express API listening on a local port → response back through MCP.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server as HttpServer } from 'http';
import request from 'supertest';
import { createMcpRouter } from './mcp-router.js';
import { createDiscoveryRouter, renderLlmsTxt } from './discovery.js';
import { createLoopbackExecutor } from './executor.js';
import { ToolCatalog } from './tool-catalog.js';
import { parseOpenAPISpec, OpenAPISpec } from '../tools/openapi-parser.js';
import { convertMultipleToMcp } from '../tools/mcp-converter.js';

const testSpec: OpenAPISpec = {
  openapi: '3.1.0',
  info: { title: 'Test API', version: '1.0.0', description: 'Spec for MCP tests' },
  paths: {
    '/api/v2/tasks': {
      get: {
        operationId: 'listTasks',
        summary: 'List tasks',
        tags: ['tasks'],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        operationId: 'createTask',
        summary: 'Create a task',
        tags: ['tasks'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', description: 'Task title' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/v2/tasks/{taskId}': {
      delete: {
        operationId: 'deleteTask',
        summary: 'Delete a task',
        tags: ['tasks'],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/api/admin/audit': {
      get: {
        operationId: 'getAudit',
        summary: 'Admin only',
        tags: ['audit'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

function buildCatalog(): ToolCatalog {
  const generic = parseOpenAPISpec(testSpec).filter(
    (t) => !(t.tags || []).includes('audit')
  );
  return {
    spec: testSpec,
    generic: new Map(generic.map((t) => [t.name, t])),
    mcpTools: convertMultipleToMcp(generic),
  };
}

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

describe('MCP server', () => {
  let server: HttpServer;
  let app: express.Express;
  const tasks = new Map<string, { id: string; title: string }>();

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // The "real API" the MCP tools dispatch into
    app.get('/api/v2/tasks', (_req, res) => {
      res.json({ data: [...tasks.values()] });
    });
    app.post('/api/v2/tasks', (req, res) => {
      if (!req.body.title) {
        res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Title is required',
            request_id: 'req_test',
            details: [{
              code: 'MISSING_FIELD',
              message: 'title missing',
              suggestion: 'Provide a title',
            }],
          },
        });
        return;
      }
      if (req.query.dry_run === 'true') {
        res.json({ data: { dry_run: true, would_create: req.body } });
        return;
      }
      const task = { id: `task_${tasks.size + 1}`, title: req.body.title };
      tasks.set(task.id, task);
      res.status(201).json({ data: task });
    });
    app.delete('/api/v2/tasks/:taskId', (req, res) => {
      const existed = tasks.delete(req.params.taskId);
      if (!existed) {
        res.status(404).json({
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'No such task',
            request_id: 'req_test',
            details: [{
              code: 'UNKNOWN_ID',
              message: 'Task not found',
              suggestion: 'List tasks to discover ids',
            }],
          },
        });
        return;
      }
      res.status(204).send();
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const catalog = buildCatalog();
    app.use('/mcp', createMcpRouter({
      executor: createLoopbackExecutor(`http://127.0.0.1:${port}`),
      catalog,
    }));
    app.use(createDiscoveryRouter(() => catalog));
  });

  afterAll(() => {
    server?.close();
  });

  async function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
    const res = await request(server)
      .post('/mcp')
      .set(MCP_HEADERS)
      .send({ jsonrpc: '2.0', id, method, params });
    return res;
  }

  it('responds to initialize', async () => {
    const res = await rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.0.1' },
    });

    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.name).toBe('human-agent-api-platform');
    expect(res.body.result.capabilities.tools).toBeDefined();
  });

  it('lists spec-generated tools with safety annotations (admin tags filtered)', async () => {
    const res = await rpc('tools/list');

    expect(res.status).toBe(200);
    const tools = res.body.result.tools;
    const names = tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(['createTask', 'deleteTask', 'listTasks']);

    const del = tools.find((t: { name: string }) => t.name === 'deleteTask');
    expect(del.annotations.destructiveHint).toBe(true);
    expect(del.inputSchema.required).toContain('taskId');

    const create = tools.find((t: { name: string }) => t.name === 'createTask');
    expect(create.inputSchema.properties.dry_run).toBeDefined();
    expect(create.inputSchema.required).toContain('title');
  });

  it('completes a create → list → delete round trip', async () => {
    const created = await rpc('tools/call', {
      name: 'createTask',
      arguments: { title: 'Ship MCP surface' },
    });
    expect(created.status).toBe(200);
    expect(created.body.result.isError).toBeFalsy();
    const createdPayload = JSON.parse(created.body.result.content[0].text);
    expect(createdPayload.status).toBe(201);
    const taskId = createdPayload.body.data.id;

    const listed = await rpc('tools/call', { name: 'listTasks', arguments: {} });
    const listedPayload = JSON.parse(listed.body.result.content[0].text);
    expect(listedPayload.body.data.some((t: { id: string }) => t.id === taskId)).toBe(true);

    const deleted = await rpc('tools/call', {
      name: 'deleteTask',
      arguments: { taskId },
    });
    const deletedPayload = JSON.parse(deleted.body.result.content[0].text);
    expect(deletedPayload.status).toBe(204);
    expect(tasks.size).toBe(0);
  });

  it('maps dry_run argument onto the query string', async () => {
    const res = await rpc('tools/call', {
      name: 'createTask',
      arguments: { title: 'Preview only', dry_run: true },
    });

    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.body.data.dry_run).toBe(true);
    expect(tasks.size).toBe(0); // nothing created
  });

  it('surfaces envelope errors (with suggestion) as isError results', async () => {
    const res = await rpc('tools/call', {
      name: 'deleteTask',
      arguments: { taskId: 'task_nope' },
    });

    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.status).toBe(404);
    expect(payload.body.error.details[0].suggestion).toBeTruthy();
  });

  it('rejects calls missing required path params with a suggestion', async () => {
    const res = await rpc('tools/call', {
      name: 'deleteTask',
      arguments: { wrongName: 'task_1' },
    });

    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.error.code).toBe('MISSING_REQUIRED_FIELD');
    expect(payload.error.suggestion).toContain('taskId');
  });

  it('rejects unknown tools with a suggestion', async () => {
    const res = await rpc('tools/call', { name: 'dropDatabase', arguments: {} });

    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.error.suggestion).toContain('tools/list');
  });

  it('returns 405 with the error envelope for GET /mcp', async () => {
    const res = await request(server).get('/mcp');

    expect(res.status).toBe(405);
    expect(res.body.error.details[0].suggestion).toBeTruthy();
  });

  it('serves /.well-known/mcp.json discovery metadata', async () => {
    const res = await request(server).get('/.well-known/mcp.json');

    expect(res.status).toBe(200);
    expect(res.body.endpoint).toMatch(/\/mcp$/);
    expect(res.body.transport).toBe('streamable-http');
    expect(res.body.tool_count).toBe(3);
  });

  it('serves a spec-derived /llms.txt', async () => {
    const res = await request(server).get('/llms.txt');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('createTask');
    expect(res.text).toContain('dry_run=true');
  });

  it('renderLlmsTxt lists every exposed tool', () => {
    const catalog = buildCatalog();
    const text = renderLlmsTxt(catalog, 'https://api.example.com');

    expect(text).toContain('https://api.example.com/mcp');
    expect(text).toContain('listTasks');
    expect(text).not.toContain('getAudit');
  });
});
