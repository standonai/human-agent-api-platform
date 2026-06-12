/**
 * Phase 4 end-to-end: human-in-the-loop approvals + idempotency keys.
 *
 * Done-when: an agent proposes a destructive change, a human approves it
 * from their session, and the agent learns the outcome without polling
 * (SSE) — plus retries are safe under Idempotency-Key.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Server as HttpServer } from 'http';
import { randomBytes } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import path from 'path';
import { initializeDatabase } from '../db/database.js';
import { initializeDefaultUsers } from '../auth/user-store.js';
import { registerAgent } from '../auth/agent-store.js';
import authRoutes from './auth-routes.js';
import oauthRoutes from './oauth-routes.js';
import delegationsRoutes from './delegations-routes.js';
import tasksRoutes from './tasks-routes.js';
import { createApprovalsRouter } from './approvals-routes.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { errorHandler } from '@standonai/agent-errors/error-handler';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { createMcpRouter } from '../mcp/mcp-router.js';
import { createLoopbackExecutor } from '../mcp/executor.js';

const tmpDir = path.join('/tmp', `approval-test-${randomBytes(4).toString('hex')}`);

let app: express.Express;
let server: HttpServer;
let baseUrl: string;
let agentId: string;
let agentKey: string;

async function registerUser(email: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'strongpass123', name: email.split('@')[0] });
  expect(res.status).toBe(201);
  return res.body.data.accessToken as string;
}

async function delegatedTokenFor(userToken: string, scopes: string[]) {
  const grant = await request(app)
    .post('/api/delegations')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ agent_id: agentId, scopes });
  const agentTokenRes = await request(app)
    .post('/oauth/token')
    .send({ grant_type: 'client_credentials', client_id: agentId, client_secret: agentKey });
  const exchanged = await request(app)
    .post('/oauth/token')
    .send({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: agentTokenRes.body.access_token,
      grant_id: grant.body.data.id,
    });
  return {
    delegated: exchanged.body.access_token as string,
    agentToken: agentTokenRes.body.access_token as string,
  };
}

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = path.join(tmpDir, 'test.db');
  process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
  await initializeDatabase();
  await initializeDefaultUsers();

  const registration = registerAgent('approval-test-agent');
  agentId = registration.id;
  agentKey = registration.apiKey;

  app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(idempotencyMiddleware);
  app.use('/api/auth', authRoutes);
  app.use('/oauth', express.urlencoded({ extended: false }), oauthRoutes);
  app.use('/api/delegations', delegationsRoutes);
  app.use('/api/v2/tasks', tasksRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  const executor = createLoopbackExecutor(baseUrl);
  app.use('/api/approvals', createApprovalsRouter({ executor }));
  app.use('/mcp', createMcpRouter({ executor }));
  app.use(errorHandler({ docBaseUrl: 'https://docs.example.com' }));
});

afterAll(() => {
  server?.close();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  delete process.env.DATABASE_URL;
  delete process.env.APPROVAL_POLICY;
});

describe('idempotency keys', () => {
  it('replays the stored response for retries with the same key', async () => {
    const token = await registerUser('idem@example.com');
    const key = 'create-task-attempt-1';

    const first = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ title: 'Idempotent task' });
    expect(first.status).toBe(201);

    const retry = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ title: 'Idempotent task' });

    expect(retry.status).toBe(201);
    expect(retry.headers['idempotency-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);

    // No duplicate task was created
    const list = await request(app)
      .get('/api/v2/tasks')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.filter((t: { title: string }) => t.title === 'Idempotent task')).toHaveLength(1);
  });

  it('rejects key reuse with a different request body', async () => {
    const token = await registerUser('idem2@example.com');
    const key = 'reused-key';

    await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ title: 'Original' });

    const conflict = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ title: 'Different body' });

    expect(conflict.status).toBe(422);
    expect(conflict.body.error.details[0].code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('human-in-the-loop approvals', () => {
  it('captures a delegated destructive change, executes it on approval', async () => {
    const userToken = await registerUser('approver@example.com');

    // User creates a task the agent will propose deleting
    const task = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Doomed task' });
    const taskId = task.body.data.id;

    const { delegated, agentToken } = await delegatedTokenFor(userToken, ['tasks:read', 'tasks:write']);

    // Agent proposes the deletion
    const proposed = await request(app)
      .delete(`/api/v2/tasks/${taskId}?require_approval=true`)
      .set('Authorization', `Bearer ${delegated}`);

    expect(proposed.status).toBe(202);
    const approvalId = proposed.body.data.approval_id;
    expect(proposed.body.data.status_url).toBe(`/api/approvals/${approvalId}`);

    // Task still exists — nothing executed yet
    const stillThere = await request(app)
      .get(`/api/v2/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(stillThere.status).toBe(200);

    // The proposing agent can poll status with its own agent token
    const polled = await request(app)
      .get(`/api/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(polled.status).toBe(200);
    expect(polled.body.data.status).toBe('pending');

    // The owner sees it listed and approves from their session
    const listed = await request(app)
      .get('/api/approvals')
      .set('Authorization', `Bearer ${userToken}`);
    expect(listed.body.data.approvals.some((a: { id: string }) => a.id === approvalId)).toBe(true);

    const approved = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('executed');
    expect(approved.body.data.result_status).toBe(204);

    // The deletion actually happened
    const gone = await request(app)
      .get(`/api/v2/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(gone.status).toBe(404);
  });

  it('rejection blocks execution and carries the reason to the agent', async () => {
    const userToken = await registerUser('rejecter@example.com');
    const { delegated, agentToken } = await delegatedTokenFor(userToken, ['tasks:read', 'tasks:write']);

    const proposed = await request(app)
      .post('/api/v2/tasks?require_approval=true')
      .set('Authorization', `Bearer ${delegated}`)
      .send({ title: 'Never to exist' });
    const approvalId = proposed.body.data.approval_id;

    const rejected = await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'Not needed' });
    expect(rejected.body.data.status).toBe('rejected');

    const seen = await request(app)
      .get(`/api/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(seen.body.data.reject_reason).toBe('Not needed');

    const list = await request(app)
      .get('/api/v2/tasks')
      .set('Authorization', `Bearer ${userToken}`);
    expect(list.body.data.some((t: { title: string }) => t.title === 'Never to exist')).toBe(false);

    // Approving after rejection conflicts
    const late = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(late.status).toBe(409);
  });

  it('works for a session user too (4-eyes on own mutations)', async () => {
    const userToken = await registerUser('foureyes@example.com');

    const proposed = await request(app)
      .post('/api/v2/tasks?require_approval=true')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Self-approved task' });
    expect(proposed.status).toBe(202);

    const approved = await request(app)
      .post(`/api/approvals/${proposed.body.data.approval_id}/approve`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(approved.body.data.status).toBe('executed');
    expect(approved.body.data.result_status).toBe(201);
  });

  it('refuses approval requests from agents acting as themselves', async () => {
    const agentTokenRes = await request(app)
      .post('/oauth/token')
      .send({ grant_type: 'client_credentials', client_id: agentId, client_secret: agentKey });

    const res = await request(app)
      .post('/api/v2/tasks?require_approval=true')
      .set('Authorization', `Bearer ${agentTokenRes.body.access_token}`)
      .send({ title: 'No human in this loop' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].code).toBe('NO_APPROVER');
  });

  it('policy can force approval for delegated destructive ops', async () => {
    process.env.APPROVAL_POLICY = 'delegated-destructive';
    try {
      const userToken = await registerUser('policy@example.com');
      const task = await request(app)
        .post('/api/v2/tasks')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Policy-protected' });

      const { delegated } = await delegatedTokenFor(userToken, ['tasks:read', 'tasks:write']);

      // No require_approval param — policy forces capture anyway
      const proposed = await request(app)
        .delete(`/api/v2/tasks/${task.body.data.id}`)
        .set('Authorization', `Bearer ${delegated}`);

      expect(proposed.status).toBe(202);
      expect(proposed.body.data.required_by_policy).toBe(true);
    } finally {
      delete process.env.APPROVAL_POLICY;
    }
  });

  it('streams the outcome over SSE — no polling', async () => {
    const userToken = await registerUser('sse@example.com');
    const { delegated, agentToken } = await delegatedTokenFor(userToken, ['tasks:read', 'tasks:write']);

    const proposed = await request(app)
      .post('/api/v2/tasks?require_approval=true')
      .set('Authorization', `Bearer ${delegated}`)
      .send({ title: 'SSE task' });
    const approvalId = proposed.body.data.approval_id;

    // Agent opens the SSE stream and waits
    const streamPromise = fetch(`${baseUrl}/api/approvals/${approvalId}/events`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    }).then(async (res) => {
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      return res.text(); // resolves when the server closes the stream
    });

    // Give the subscription a beat, then the human approves
    await new Promise((r) => setTimeout(r, 150));
    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${userToken}`);

    const stream = await streamPromise;
    expect(stream).toContain('"status":"pending"');
    expect(stream).toContain('"status":"executed"');
    expect(stream).toContain('"result_status":201');
  });

  it('proposes over MCP: require_approval input becomes a 202 capture', async () => {
    const userToken = await registerUser('mcppropose@example.com');
    const { delegated } = await delegatedTokenFor(userToken, ['tasks:read', 'tasks:write']);

    const res = await request(server)
      .post('/mcp')
      .set({
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${delegated}`,
      })
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'createTask',
          arguments: { title: 'Proposed via MCP', require_approval: true },
        },
      });

    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.status).toBe(202);
    expect(payload.body.data.approval_id).toBeTruthy();

    // Human approves; the change executes with the agent's context restored
    const approved = await request(app)
      .post(`/api/approvals/${payload.body.data.approval_id}/approve`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(approved.body.data.status).toBe('executed');
    expect(approved.body.data.result_status).toBe(201);
    expect(approved.body.data.result_body.data.title).toBe('Proposed via MCP');
  });
});
