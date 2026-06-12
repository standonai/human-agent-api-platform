/**
 * Eval targets: the reference platform (spawned as a real subprocess with a
 * throwaway database) and the vanilla baseline (in-process).
 *
 * Both agents get the same endpoint skeleton, so the comparison isolates
 * the platform's AX features (suggestion-bearing errors, llms.txt
 * self-description, dry-run) rather than documentation asymmetry.
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import { startBaseline } from './baseline-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface EvalTarget {
  name: 'reference' | 'baseline';
  baseUrl: string;
  apiDoc: string;
  stop: () => Promise<void>;
}

const ENDPOINT_SKELETON = `Endpoints:
- POST /api/auth/register  (create account)
- POST /api/auth/login
- GET/POST /api/v2/tasks
- GET/PUT/DELETE /api/v2/tasks/{id}
Authenticate requests with: Authorization: Bearer <token>`;

export async function startBaselineTarget(): Promise<EvalTarget> {
  const { server, baseUrl } = await startBaseline();
  return {
    name: 'baseline',
    baseUrl,
    apiDoc: ENDPOINT_SKELETON,
    stop: () => closeServer(server),
  };
}

export async function startReferenceTarget(port = 4690): Promise<EvalTarget> {
  const referenceDir = join(__dirname, '../../reference');
  const dataDir = mkdtempSync(join(tmpdir(), 'ax-eval-ref-'));

  const child: ChildProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: referenceDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: join(dataDir, 'eval.db'),
      JWT_SECRET: 'ax-eval-secret-0123456789abcdef0123456789',
      DISABLE_REDIS: 'true',
      NODE_ENV: 'development',
    },
    stdio: 'ignore',
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(`${baseUrl}/api/health`, 30_000);

  // The platform self-describes — its llms.txt is part of the product.
  const llmsTxt = await (await fetch(`${baseUrl}/llms.txt`)).text();

  return {
    name: 'reference',
    baseUrl,
    apiDoc: `${ENDPOINT_SKELETON}\n\nThe API also publishes this self-description:\n${llmsTxt}`,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ok */ }
    },
  };
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Target at ${url} did not become healthy in ${timeoutMs}ms`);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
