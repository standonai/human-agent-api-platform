/**
 * Eval scenarios. Each scenario gives the agent a goal plus credentials and
 * verifies the outcome purely through the API (login as the same user and
 * inspect state) — so verification is identical for both targets.
 *
 * Instructions are deliberately minimal: the agent must discover field
 * names, auth mechanics, and recover from its own mistakes. That recovery
 * is exactly where the platform's suggestion-bearing errors should pay off.
 */

export interface ScenarioContext {
  baseUrl: string;
  email: string;
  password: string;
}

export interface Scenario {
  id: string;
  instruction: (ctx: ScenarioContext) => string;
  verify: (ctx: ScenarioContext) => Promise<boolean>;
}

interface VerifierTask {
  id: string;
  title: string;
  status: string;
  assignee?: string;
}

/** Login as the scenario user and list their tasks — target-agnostic. */
async function listTasks(ctx: ScenarioContext): Promise<VerifierTask[]> {
  const login = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ctx.email, password: ctx.password }),
  });
  if (!login.ok) return [];
  const loginBody = await login.json() as Record<string, unknown>;
  const token =
    (loginBody.token as string) ||
    ((loginBody.data as Record<string, unknown> | undefined)?.accessToken as string);
  if (!token) return [];

  const res = await fetch(`${ctx.baseUrl}/api/v2/tasks`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = await res.json() as unknown;

  // Reference shape: {data: [...]}; baseline shape: [...]
  if (Array.isArray(body)) return body as VerifierTask[];
  const data = (body as Record<string, unknown>).data;
  if (Array.isArray(data)) return data as VerifierTask[];
  return [];
}

export const scenarios: Scenario[] = [
  {
    id: 'create-task',
    instruction: (ctx) =>
      `Create an account with email ${ctx.email}, password "${ctx.password}", name "Eval Agent". ` +
      `Then create a task titled "Quarterly report".`,
    verify: async (ctx) =>
      (await listTasks(ctx)).some((t) => t.title === 'Quarterly report'),
  },
  {
    id: 'create-and-complete',
    instruction: (ctx) =>
      `Create an account with email ${ctx.email}, password "${ctx.password}", name "Eval Agent". ` +
      `Create a task titled "Ship release", then mark that task's status as "done".`,
    verify: async (ctx) =>
      (await listTasks(ctx)).some((t) => t.title === 'Ship release' && t.status === 'done'),
  },
  {
    id: 'create-two-delete-one',
    instruction: (ctx) =>
      `Create an account with email ${ctx.email}, password "${ctx.password}", name "Eval Agent". ` +
      `Create two tasks titled "Keep me" and "Remove me", then delete the one titled "Remove me".`,
    verify: async (ctx) => {
      const tasks = await listTasks(ctx);
      return (
        tasks.some((t) => t.title === 'Keep me') &&
        !tasks.some((t) => t.title === 'Remove me')
      );
    },
  },
  {
    id: 'reassign-task',
    instruction: (ctx) =>
      `Create an account with email ${ctx.email}, password "${ctx.password}", name "Eval Agent". ` +
      `Create a task titled "Review PR" assigned to "bob@example.com", then change its assignee to "alice@example.com".`,
    verify: async (ctx) =>
      (await listTasks(ctx)).some(
        (t) => t.title === 'Review PR' && t.assignee === 'alice@example.com'
      ),
  },
  {
    id: 'batch-statuses',
    instruction: (ctx) =>
      `Create an account with email ${ctx.email}, password "${ctx.password}", name "Eval Agent". ` +
      `Create three tasks: "Alpha" with status "todo", "Beta" with status "in-progress", and "Gamma" with status "done".`,
    verify: async (ctx) => {
      const tasks = await listTasks(ctx);
      return (
        tasks.some((t) => t.title === 'Alpha' && t.status === 'todo') &&
        tasks.some((t) => t.title === 'Beta' && t.status === 'in-progress') &&
        tasks.some((t) => t.title === 'Gamma' && t.status === 'done')
      );
    },
  },
  {
    id: 'rename-task',
    instruction: (ctx) =>
      `Create an account with email ${ctx.email}, password "${ctx.password}", name "Eval Agent". ` +
      `Create a task titled "Draft v1", then rename it to "Draft v2 (final)".`,
    verify: async (ctx) => {
      const tasks = await listTasks(ctx);
      return (
        tasks.some((t) => t.title === 'Draft v2 (final)') &&
        !tasks.some((t) => t.title === 'Draft v1')
      );
    },
  },
  {
    id: 'cleanup-done',
    instruction: (ctx) =>
      `Create an account with email ${ctx.email}, password "${ctx.password}", name "Eval Agent". ` +
      `Create tasks "One" (status "done"), "Two" (status "todo"), "Three" (status "done"). ` +
      `Then delete every task whose status is "done".`,
    verify: async (ctx) => {
      const tasks = await listTasks(ctx);
      return (
        tasks.some((t) => t.title === 'Two') &&
        !tasks.some((t) => t.title === 'One') &&
        !tasks.some((t) => t.title === 'Three')
      );
    },
  },
  {
    id: 'login-fresh-session',
    instruction: (ctx) =>
      `An account already exists with email ${ctx.email} and password "${ctx.password}". ` +
      `Log in to it and create a task titled "Second session".`,
    verify: async (ctx) =>
      (await listTasks(ctx)).some((t) => t.title === 'Second session'),
  },
];

/** Scenarios that need state prepared before the agent starts. */
export async function setupScenario(scenario: Scenario, ctx: ScenarioContext): Promise<void> {
  if (scenario.id === 'login-fresh-session') {
    await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ctx.email, password: ctx.password, name: 'Eval Agent' }),
    });
  }
}
