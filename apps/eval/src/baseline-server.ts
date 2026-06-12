/**
 * The baseline: a deliberately "vanilla" API with the same endpoints as the
 * reference platform but none of its agent experience. Terse errors with no
 * codes and no suggestions, no dry-run, no llms.txt, no discovery. This is
 * what a typical quickly-built internal API looks like — the control group.
 */

import express, { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import { randomUUID } from 'crypto';

interface BaselineUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

interface BaselineTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  assignee?: string;
  ownerId: string;
}

export function createBaselineApp(): express.Express {
  const app = express();
  app.use(express.json());

  const users = new Map<string, BaselineUser>();   // by email
  const tokens = new Map<string, string>();        // token -> userId
  const tasks = new Map<string, BaselineTask>();
  let userSeq = 1;
  let taskSeq = 1;

  function authed(req: Request, res: Response): string | undefined {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const userId = tokens.get(token);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return undefined;
    }
    return userId;
  }

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name || users.has(email)) {
      res.status(400).json({ error: 'Bad Request' });
      return;
    }
    const user: BaselineUser = { id: `u${userSeq++}`, email, password, name };
    users.set(email, user);
    const token = randomUUID();
    tokens.set(token, user.id);
    res.status(201).json({ token });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const user = users.get(email);
    if (!user || user.password !== password) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = randomUUID();
    tokens.set(token, user.id);
    res.json({ token });
  });

  app.get('/api/v2/tasks', (req: Request, res: Response) => {
    const userId = authed(req, res);
    if (!userId) return;
    res.json([...tasks.values()].filter((t) => t.ownerId === userId));
  });

  app.post('/api/v2/tasks', (req: Request, res: Response) => {
    const userId = authed(req, res);
    if (!userId) return;
    const { title, description, status, assignee } = req.body || {};
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Bad Request' });
      return;
    }
    const task: BaselineTask = {
      id: `t${taskSeq++}`,
      title,
      description,
      status: status || 'todo',
      assignee,
      ownerId: userId,
    };
    tasks.set(task.id, task);
    res.status(201).json(task);
  });

  app.get('/api/v2/tasks/:id', (req: Request, res: Response) => {
    const userId = authed(req, res);
    if (!userId) return;
    const task = tasks.get(req.params.id);
    if (!task || task.ownerId !== userId) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    res.json(task);
  });

  app.put('/api/v2/tasks/:id', (req: Request, res: Response) => {
    const userId = authed(req, res);
    if (!userId) return;
    const task = tasks.get(req.params.id);
    if (!task || task.ownerId !== userId) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    const { title, description, status, assignee } = req.body || {};
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (assignee !== undefined) task.assignee = assignee;
    res.json(task);
  });

  app.delete('/api/v2/tasks/:id', (req: Request, res: Response) => {
    const userId = authed(req, res);
    if (!userId) return;
    const task = tasks.get(req.params.id);
    if (!task || task.ownerId !== userId) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    tasks.delete(req.params.id);
    res.status(204).send();
  });

  // Parity with typical vanilla APIs: any other error is a bare 500.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    void err;
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export function startBaseline(): Promise<{ server: Server; baseUrl: string }> {
  const app = createBaselineApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}
