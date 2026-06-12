/**
 * Proves the eval can stand up the real reference platform as a subprocess
 * and that the agent's "API documentation" context assembles — the whole
 * pipeline except the model itself.
 */

import { describe, it, expect } from 'vitest';
import { startReferenceTarget } from './targets.js';
import { scenarios, ScenarioContext } from './scenarios.js';

describe('reference target', () => {
  it('spawns, self-describes via llms.txt, and verifiers work against it', async () => {
    const target = await startReferenceTarget(4691);
    try {
      expect(target.apiDoc).toContain('suggestion');         // llms.txt explains self-correction
      expect(target.apiDoc).toContain('dry_run');            // and dry-run

      // Run one scenario's work through the real platform and verify it
      const ctx: ScenarioContext = {
        baseUrl: target.baseUrl,
        email: 'target-test@eval.example.com',
        password: 'eval-password-123',
      };
      const reg = await fetch(`${target.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ctx.email, password: ctx.password, name: 'Target Test' }),
      });
      expect(reg.status).toBe(201);
      const regBody = await reg.json() as { data: { accessToken: string } };
      const token = regBody.data.accessToken;

      await fetch(`${target.baseUrl}/api/v2/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: 'Quarterly report' }),
      });

      const createTask = scenarios.find((s) => s.id === 'create-task')!;
      expect(await createTask.verify(ctx)).toBe(true);
    } finally {
      await target.stop();
    }
  }, 45_000);
});
