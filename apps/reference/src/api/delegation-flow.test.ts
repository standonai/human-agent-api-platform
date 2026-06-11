/**
 * Delegation end-to-end: the Phase 3 "done when" criteria.
 *
 * A user grants an agent time-boxed, scoped authority; the agent exchanges
 * credentials for tokens at /oauth/token; delegated requests act as the
 * user (ownership) but never inherit role; revocation is immediate; and
 * the whole flow works over MCP.
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
import { errorHandler } from '../middleware/error-handler.js';
import { requestIdMiddleware } from '../middleware/request-id.js';
import { createMcpRouter } from '../mcp/mcp-router.js';
import { createLoopbackExecutor } from '../mcp/executor.js';

const tmpDir = path.join('/tmp', `delegation-test-${randomBytes(4).toString('hex')}`);

let app: express.Express;
let server: HttpServer;
let agentId: string;
let agentKey: string;

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

async function registerUser(email: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'strongpass123', name: email.split('@')[0] });
  expect(res.status).toBe(201);
  return res.body.data.accessToken as string;
}

async function getAgentToken() {
  const res = await request(app)
    .post('/oauth/token')
    .send({ grant_type: 'client_credentials', client_id: agentId, client_secret: agentKey });
  expect(res.status).toBe(200);
  return res.body.access_token as string;
}

async function exchangeForDelegated(agentToken: string, params: Record<string, string>) {
  return request(app)
    .post('/oauth/token')
    .send({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: agentToken,
      ...params,
    });
}

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = path.join(tmpDir, 'test.db');
  process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'admin-test-password';
  await initializeDatabase();
  await initializeDefaultUsers();

  const registration = registerAgent('delegation-test-agent');
  agentId = registration.id;
  agentKey = registration.apiKey;

  app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/auth', authRoutes);
  app.use('/oauth', express.urlencoded({ extended: false }), oauthRoutes);
  app.use('/api/delegations', delegationsRoutes);
  app.use('/api/v2/tasks', tasksRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  app.use('/mcp', createMcpRouter({
    executor: createLoopbackExecutor(`http://127.0.0.1:${port}`),
  }));
  app.use(errorHandler({ docBaseUrl: 'https://docs.example.com' }));
});

afterAll(() => {
  server?.close();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  delete process.env.DATABASE_URL;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
});

describe('delegation grants API', () => {
  it('requires a session token to create a grant', async () => {
    const res = await request(app)
      .post('/api/delegations')
      .send({ agent_id: agentId, scopes: ['tasks:read'] });

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('oauth-protected-resource');
  });

  it('rejects unknown scopes with a suggestion', async () => {
    const token = await registerUser('scopes@example.com');
    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${token}`)
      .send({ agent_id: agentId, scopes: ['tasks:admin'] });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].code).toBe('UNKNOWN_SCOPE');
    expect(res.body.error.details[0].message).toContain('tasks:read');
  });

  it('caps expires_in at the server max', async () => {
    const token = await registerUser('ttl@example.com');
    const res = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${token}`)
      .send({ agent_id: agentId, scopes: ['tasks:read'], expires_in: 99999999 });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].code).toBe('VALUE_OUT_OF_RANGE');
  });

  it('creates and lists grants', async () => {
    const token = await registerUser('granter@example.com');
    const created = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${token}`)
      .send({ agent_id: agentId, scopes: ['tasks:read', 'tasks:write'], expires_in: 3600 });

    expect(created.status).toBe(201);
    expect(created.body.data.active).toBe(true);

    const listed = await request(app)
      .get('/api/delegations')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.body.data.delegations.some((g: { id: string }) => g.id === created.body.data.id)).toBe(true);
  });
});

describe('/oauth/token', () => {
  it('rejects bad client credentials with a suggestion', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .send({ grant_type: 'client_credentials', client_id: agentId, client_secret: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.details[0].suggestion).toBeTruthy();
  });

  it('issues agent tokens for valid credentials (form-encoded too)', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: agentId, client_secret: agentKey });

    expect(res.status).toBe(200);
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBeGreaterThan(0);
  });

  it('exchanges an agent token + grant for a delegated token, narrowed to requested scope', async () => {
    const userToken = await registerUser('exchange@example.com');
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read', 'tasks:write'] });

    const agentToken = await getAgentToken();
    const exchanged = await exchangeForDelegated(agentToken, {
      grant_id: grant.body.data.id,
      scope: 'tasks:read',
    });

    expect(exchanged.status).toBe(200);
    expect(exchanged.body.scope).toBe('tasks:read');
  });

  it('refuses scopes beyond the grant', async () => {
    const userToken = await registerUser('narrow@example.com');
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read'] });

    const agentToken = await getAgentToken();
    const exchanged = await exchangeForDelegated(agentToken, {
      grant_id: grant.body.data.id,
      scope: 'tasks:read tasks:write',
    });

    expect(exchanged.status).toBe(400);
    expect(exchanged.body.error.details[0].code).toBe('SCOPE_EXCEEDS_GRANT');
  });

  it('resolves the newest active grant from scopes when grant_id is omitted', async () => {
    const userToken = await registerUser('byscope@example.com');
    await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['profile:read'] });

    const agentToken = await getAgentToken();
    const exchanged = await exchangeForDelegated(agentToken, { scope: 'profile:read' });

    expect(exchanged.status).toBe(200);
    expect(exchanged.body.scope).toBe('profile:read');
  });

  it('rejects a session token as subject_token', async () => {
    const userToken = await registerUser('subject@example.com');
    const exchanged = await exchangeForDelegated(userToken, { scope: 'tasks:read' });

    expect(exchanged.status).toBe(401);
    expect(exchanged.body.error.details[0].code).toBe('INVALID_SUBJECT_TOKEN');
  });
});

describe('delegated authority end to end', () => {
  it('acts as the user: created tasks are owned by the delegating user', async () => {
    const userToken = await registerUser('owner@example.com');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`);
    const userId = me.body.data.id;

    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read', 'tasks:write'] });
    const agentToken = await getAgentToken();
    const delegated = (await exchangeForDelegated(agentToken, { grant_id: grant.body.data.id }))
      .body.access_token;

    const created = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${delegated}`)
      .send({ title: 'Created on behalf of owner' });

    expect(created.status).toBe(201);
    expect(created.body.data.ownerId).toBe(userId);

    // The user sees the task as their own
    const viaUser = await request(app)
      .get(`/api/v2/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(viaUser.status).toBe(200);
  });

  it('enforces scopes: read-only grant cannot write', async () => {
    const userToken = await registerUser('readonly@example.com');
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read'] });
    const agentToken = await getAgentToken();
    const delegated = (await exchangeForDelegated(agentToken, { grant_id: grant.body.data.id }))
      .body.access_token;

    const list = await request(app)
      .get('/api/v2/tasks')
      .set('Authorization', `Bearer ${delegated}`);
    expect(list.status).toBe(200);

    const write = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${delegated}`)
      .send({ title: 'Should be blocked' });
    expect(write.status).toBe(403);
    expect(write.body.error.details[0].code).toBe('INSUFFICIENT_SCOPE');
    expect(write.body.error.details[0].suggestion).toContain('tasks:write');
  });

  it('never delegates role: delegated-of-admin sees only the admin user’s tasks', async () => {
    // Another user creates a task the admin should NOT see via delegation
    const otherToken = await registerUser('bystander@example.com');
    await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Bystander task' });

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'admin-test-password' });
    const adminToken = adminLogin.body.data.accessToken;

    // Admin sees everything directly
    const adminList = await request(app)
      .get('/api/v2/tasks')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.body.data.some((t: { title: string }) => t.title === 'Bystander task')).toBe(true);

    // ...but an agent delegated by the admin does not
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read'] });
    const agentToken = await getAgentToken();
    const delegated = (await exchangeForDelegated(agentToken, { grant_id: grant.body.data.id }))
      .body.access_token;

    const delegatedList = await request(app)
      .get('/api/v2/tasks')
      .set('Authorization', `Bearer ${delegated}`);
    expect(delegatedList.status).toBe(200);
    expect(delegatedList.body.data.some((t: { title: string }) => t.title === 'Bystander task')).toBe(false);
  });

  it('blocks delegated tokens from managing grants', async () => {
    const userToken = await registerUser('noescalation@example.com');
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read', 'tasks:write'] });
    const agentToken = await getAgentToken();
    const delegated = (await exchangeForDelegated(agentToken, { grant_id: grant.body.data.id }))
      .body.access_token;

    const attempt = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${delegated}`)
      .send({ agent_id: agentId, scopes: ['tasks:read'] });

    expect(attempt.status).toBe(403);
    expect(attempt.body.error.details[0].code).toBe('SESSION_REQUIRED');
  });

  it('agent tokens are not user principals', async () => {
    const agentToken = await getAgentToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.details[0].code).toBe('USER_PRINCIPAL_REQUIRED');
  });

  it('enforces profile:read for /me under delegation', async () => {
    const userToken = await registerUser('profile@example.com');
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read'] });
    const agentToken = await getAgentToken();
    const delegated = (await exchangeForDelegated(agentToken, { grant_id: grant.body.data.id }))
      .body.access_token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${delegated}`);
    expect(res.status).toBe(403);
    expect(res.body.error.details[0].code).toBe('INSUFFICIENT_SCOPE');
  });

  it('revocation is immediate for outstanding delegated tokens', async () => {
    const userToken = await registerUser('revoker@example.com');
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read', 'tasks:write'] });
    const agentToken = await getAgentToken();
    const delegated = (await exchangeForDelegated(agentToken, { grant_id: grant.body.data.id }))
      .body.access_token;

    // Token works...
    const before = await request(app)
      .get('/api/v2/tasks')
      .set('Authorization', `Bearer ${delegated}`);
    expect(before.status).toBe(200);

    // ...user revokes...
    const revoke = await request(app)
      .delete(`/api/delegations/${grant.body.data.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(revoke.status).toBe(200);

    // ...same token now fails with a clear reason, despite valid JWT exp.
    const after = await request(app)
      .get('/api/v2/tasks')
      .set('Authorization', `Bearer ${delegated}`);
    expect(after.status).toBe(401);
    expect(after.body.error.details[0].code).toBe('GRANT_REVOKED');
  });
});

describe('delegation over MCP', () => {
  it('completes a delegated task round trip through /mcp and dies on revocation', async () => {
    const userToken = await registerUser('mcpdelegate@example.com');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`);
    const grant = await request(app)
      .post('/api/delegations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ agent_id: agentId, scopes: ['tasks:read', 'tasks:write'] });
    const agentToken = await getAgentToken();
    const delegated = (await exchangeForDelegated(agentToken, { grant_id: grant.body.data.id }))
      .body.access_token;

    const call = (name: string, args: Record<string, unknown>, id: number) =>
      request(server)
        .post('/mcp')
        .set(MCP_HEADERS)
        .set('Authorization', `Bearer ${delegated}`)
        .send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

    const created = await call('createTask', { title: 'Delegated via MCP' }, 1);
    const createdPayload = JSON.parse(created.body.result.content[0].text);
    expect(createdPayload.status).toBe(201);
    expect(createdPayload.body.data.ownerId).toBe(me.body.data.id);

    await request(app)
      .delete(`/api/delegations/${grant.body.data.id}`)
      .set('Authorization', `Bearer ${userToken}`);

    const afterRevoke = await call('listTasks', {}, 2);
    expect(afterRevoke.body.result.isError).toBe(true);
    const payload = JSON.parse(afterRevoke.body.result.content[0].text);
    expect(payload.status).toBe(401);
    expect(payload.body.error.details[0].code).toBe('GRANT_REVOKED');
  });
});
