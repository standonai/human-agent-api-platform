/**
 * Keyless harness tests: everything except the Claude calls.
 * Proves the baseline target works, the verifiers verify (against both
 * response shapes), and the report math is right.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { startBaseline } from './baseline-server.js';
import { scenarios, setupScenario, ScenarioContext } from './scenarios.js';
import { summarize, renderMarkdown, ScenarioResult } from './report.js';

let baseline: { server: Server; baseUrl: string };

beforeAll(async () => {
  baseline = await startBaseline();
});

afterAll(() => {
  baseline.server.close();
});

async function api(path: string, init?: RequestInit & { token?: string }) {
  const res = await fetch(`${baseline.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe('baseline server (the control group)', () => {
  it('registers, logs in, and does task CRUD with vanilla responses', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', password: 'pw', name: 'A' }),
    });
    expect(reg.status).toBe(201);
    const token = reg.body.token;

    const created = await api('/api/v2/tasks', {
      method: 'POST',
      token,
      body: JSON.stringify({ title: 'T1' }),
    });
    expect(created.status).toBe(201);

    const list = await api('/api/v2/tasks', { token });
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body).toHaveLength(1);

    const del = await api(`/api/v2/tasks/${created.body.id}`, { method: 'DELETE', token });
    expect(del.status).toBe(204);
  });

  it('returns terse errors with no codes and no suggestions', async () => {
    const unauthed = await api('/api/v2/tasks');
    expect(unauthed.status).toBe(401);
    expect(unauthed.body).toEqual({ error: 'Unauthorized' });

    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'c@d.com', password: 'pw', name: 'C' }),
    });
    const bad = await api('/api/v2/tasks', {
      method: 'POST',
      token: reg.body.token,
      body: JSON.stringify({ description: 'no title' }),
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'Bad Request' });
    expect(JSON.stringify(bad.body)).not.toContain('suggestion');
  });

  it('ignores dry_run (no preview mode in the control group)', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'e@f.com', password: 'pw', name: 'E' }),
    });
    const created = await api('/api/v2/tasks?dry_run=true', {
      method: 'POST',
      token: reg.body.token,
      body: JSON.stringify({ title: 'Created despite dry_run' }),
    });
    expect(created.status).toBe(201); // really created — that's the point
  });
});

describe('scenario verifiers', () => {
  it('every scenario verifies false on an untouched target and true after the work is done', async () => {
    for (const scenario of scenarios) {
      const ctx: ScenarioContext = {
        baseUrl: baseline.baseUrl,
        email: `${scenario.id}-verify@eval.example.com`,
        password: 'eval-password-123',
      };
      await setupScenario(scenario, ctx);
      expect(await scenario.verify(ctx), `${scenario.id} should start unverified`).toBe(false);

      await performScenarioWork(scenario.id, ctx);
      expect(await scenario.verify(ctx), `${scenario.id} should verify after work`).toBe(true);
    }
  });

  it('handles the reference response shapes ({data: {accessToken}}, {data: [tasks]})', async () => {
    // Mini server speaking the reference platform's envelope shapes
    const app = express();
    app.use(express.json());
    app.post('/api/auth/login', (_req, res) => {
      res.json({ data: { accessToken: 'ref-token' } });
    });
    app.get('/api/v2/tasks', (_req, res) => {
      res.json({ data: [{ id: 't1', title: 'Quarterly report', status: 'todo' }] });
    });
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const ctx: ScenarioContext = {
      baseUrl: `http://127.0.0.1:${port}`,
      email: 'shape@eval.example.com',
      password: 'pw',
    };
    const createTask = scenarios.find((s) => s.id === 'create-task')!;
    expect(await createTask.verify(ctx)).toBe(true);
    server.close();
  });
});

describe('report', () => {
  it('aggregates per target and renders the table', () => {
    const results: ScenarioResult[] = [
      { scenarioId: 'a', target: 'reference', success: true, zeroShot: true, httpCalls: 4, errorResponses: 0, inputTokens: 100, outputTokens: 10 },
      { scenarioId: 'b', target: 'reference', success: true, zeroShot: false, httpCalls: 6, errorResponses: 2, inputTokens: 100, outputTokens: 10 },
      { scenarioId: 'a', target: 'baseline', success: false, zeroShot: false, httpCalls: 9, errorResponses: 5, inputTokens: 100, outputTokens: 10 },
    ];
    const summaries = summarize(results);
    const ref = summaries.find((s) => s.target === 'reference')!;
    expect(ref.successes).toBe(2);
    expect(ref.zeroShot).toBe(1);
    expect(ref.totalErrors).toBe(2);

    const md = renderMarkdown(summaries, results, 'claude-haiku-4-5');
    expect(md).toContain('| reference | 2/2 (100%) | 1/2 (50%) |');
    expect(md).toContain('claude-haiku-4-5');
  });
});

/**
 * Performs each scenario's work directly (the "perfect agent"), so the
 * verifier's true-path is provable without any model in the loop.
 */
async function performScenarioWork(id: string, ctx: ScenarioContext): Promise<void> {
  let token: string;
  if (id === 'login-fresh-session') {
    const login = await api2(ctx, '/api/auth/login', 'POST', { email: ctx.email, password: ctx.password });
    token = login.token;
  } else {
    const reg = await api2(ctx, '/api/auth/register', 'POST', {
      email: ctx.email, password: ctx.password, name: 'Eval Agent',
    });
    token = reg.token;
  }

  const create = (body: Record<string, unknown>) =>
    api2(ctx, '/api/v2/tasks', 'POST', body, token);

  switch (id) {
    case 'create-task':
      await create({ title: 'Quarterly report' });
      break;
    case 'create-and-complete': {
      const t = await create({ title: 'Ship release' });
      await api2(ctx, `/api/v2/tasks/${t.id}`, 'PUT', { status: 'done' }, token);
      break;
    }
    case 'create-two-delete-one': {
      await create({ title: 'Keep me' });
      const t = await create({ title: 'Remove me' });
      await api2(ctx, `/api/v2/tasks/${t.id}`, 'DELETE', undefined, token);
      break;
    }
    case 'reassign-task': {
      const t = await create({ title: 'Review PR', assignee: 'bob@example.com' });
      await api2(ctx, `/api/v2/tasks/${t.id}`, 'PUT', { assignee: 'alice@example.com' }, token);
      break;
    }
    case 'batch-statuses':
      await create({ title: 'Alpha', status: 'todo' });
      await create({ title: 'Beta', status: 'in-progress' });
      await create({ title: 'Gamma', status: 'done' });
      break;
    case 'rename-task': {
      const t = await create({ title: 'Draft v1' });
      await api2(ctx, `/api/v2/tasks/${t.id}`, 'PUT', { title: 'Draft v2 (final)' }, token);
      break;
    }
    case 'cleanup-done': {
      const one = await create({ title: 'One', status: 'done' });
      await create({ title: 'Two', status: 'todo' });
      const three = await create({ title: 'Three', status: 'done' });
      await api2(ctx, `/api/v2/tasks/${one.id}`, 'DELETE', undefined, token);
      await api2(ctx, `/api/v2/tasks/${three.id}`, 'DELETE', undefined, token);
      break;
    }
    case 'login-fresh-session':
      await create({ title: 'Second session' });
      break;
    default:
      throw new Error(`No worker for scenario ${id}`);
  }
}

async function api2(
  ctx: ScenarioContext,
  path: string,
  method: string,
  body?: Record<string, unknown>,
  token?: string
): Promise<Record<string, any>> {
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
