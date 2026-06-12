/**
 * Aggregation and the published markdown table.
 *
 * Zero-shot success = the scenario verified AND the agent never received a
 * 4xx/5xx along the way — the platform-level analog of the
 * agent_zero_shot_success_rate gauge.
 */

export interface ScenarioResult {
  scenarioId: string;
  target: string;
  success: boolean;
  zeroShot: boolean;
  httpCalls: number;
  errorResponses: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TargetSummary {
  target: string;
  scenarios: number;
  successes: number;
  zeroShot: number;
  totalErrors: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
}

export function summarize(results: ScenarioResult[]): TargetSummary[] {
  const byTarget = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const list = byTarget.get(r.target) || [];
    list.push(r);
    byTarget.set(r.target, list);
  }

  return [...byTarget.entries()].map(([target, list]) => ({
    target,
    scenarios: list.length,
    successes: list.filter((r) => r.success).length,
    zeroShot: list.filter((r) => r.zeroShot).length,
    totalErrors: list.reduce((sum, r) => sum + r.errorResponses, 0),
    totalCalls: list.reduce((sum, r) => sum + r.httpCalls, 0),
    inputTokens: list.reduce((sum, r) => sum + r.inputTokens, 0),
    outputTokens: list.reduce((sum, r) => sum + r.outputTokens, 0),
  }));
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`;
}

export function renderMarkdown(
  summaries: TargetSummary[],
  results: ScenarioResult[],
  model: string
): string {
  const lines: string[] = [];
  lines.push(`## AX Eval Results`);
  lines.push('');
  lines.push(`Model: \`${model}\` · ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('| Target | Task success | Zero-shot (no errors) | API errors encountered | HTTP calls | Tokens (in/out) |');
  lines.push('|--------|-------------|----------------------|------------------------|-----------|-----------------|');
  for (const s of summaries) {
    lines.push(
      `| ${s.target} | ${s.successes}/${s.scenarios} (${pct(s.successes, s.scenarios)}) ` +
      `| ${s.zeroShot}/${s.scenarios} (${pct(s.zeroShot, s.scenarios)}) ` +
      `| ${s.totalErrors} | ${s.totalCalls} | ${s.inputTokens.toLocaleString()}/${s.outputTokens.toLocaleString()} |`
    );
  }
  lines.push('');
  lines.push('<details><summary>Per-scenario detail</summary>');
  lines.push('');
  lines.push('| Scenario | Target | Success | Zero-shot | Errors | Calls |');
  lines.push('|----------|--------|---------|-----------|--------|-------|');
  for (const r of results) {
    lines.push(
      `| ${r.scenarioId} | ${r.target} | ${r.success ? '✅' : '❌'} | ${r.zeroShot ? '✅' : '—'} | ${r.errorResponses} | ${r.httpCalls} |`
    );
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
  return lines.join('\n');
}
