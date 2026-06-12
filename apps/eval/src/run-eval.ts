/**
 * AX eval runner.
 *
 *   ANTHROPIC_API_KEY=... npm run eval            # from repo root
 *   EVAL_MODEL=claude-sonnet-4-6 npm run eval     # override the model
 *
 * Drives the agent through every scenario against both targets, prints the
 * markdown results table, and writes results/latest.md + latest.json.
 */

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runAgent, DEFAULT_EVAL_MODEL } from './agent.js';
import { scenarios, setupScenario, ScenarioContext } from './scenarios.js';
import { startBaselineTarget, startReferenceTarget, EvalTarget } from './targets.js';
import { ScenarioResult, renderMarkdown, summarize } from './report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY is not set. The eval drives a real Claude agent and ' +
      'incurs (modest) API costs — set the key and re-run: npm run eval'
    );
    process.exit(2);
  }

  const model = process.env.EVAL_MODEL || DEFAULT_EVAL_MODEL;
  const client = new Anthropic();

  console.log(`AX eval: ${scenarios.length} scenarios × 2 targets, model ${model}\n`);

  const targets: EvalTarget[] = [];
  const results: ScenarioResult[] = [];

  try {
    targets.push(await startReferenceTarget());
    targets.push(await startBaselineTarget());

    for (const target of targets) {
      console.log(`── target: ${target.name} (${target.baseUrl})`);
      for (const [index, scenario] of scenarios.entries()) {
        const ctx: ScenarioContext = {
          baseUrl: target.baseUrl,
          email: `${scenario.id}-${target.name}-${Date.now()}@eval.example.com`,
          password: 'eval-password-123',
        };
        await setupScenario(scenario, ctx);

        const run = await runAgent({
          client,
          model,
          baseUrl: target.baseUrl,
          apiDoc: target.apiDoc,
          instruction: scenario.instruction(ctx),
        });
        const success = await scenario.verify(ctx);

        const result: ScenarioResult = {
          scenarioId: scenario.id,
          target: target.name,
          success,
          zeroShot: success && run.errorResponses === 0,
          httpCalls: run.httpCalls,
          errorResponses: run.errorResponses,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
        };
        results.push(result);

        console.log(
          `  [${index + 1}/${scenarios.length}] ${scenario.id}: ` +
          `${success ? 'ok' : 'FAILED'}${result.zeroShot ? ' (zero-shot)' : ''} ` +
          `— ${run.httpCalls} calls, ${run.errorResponses} errors`
        );
      }
    }
  } finally {
    for (const target of targets) {
      await target.stop();
    }
  }

  const summaries = summarize(results);
  const markdown = renderMarkdown(summaries, results, model);

  const outDir = join(__dirname, '../results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'latest.md'), markdown);
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify({ model, results }, null, 2));

  console.log('\n' + markdown);
  console.log(`Written to apps/eval/results/latest.{md,json}`);
}

main().catch((error) => {
  console.error('Eval failed:', error);
  process.exit(1);
});
