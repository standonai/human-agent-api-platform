# AX Eval

Proves the platform's thesis with a real agent: Claude (via the API) is
driven through task scenarios against two targets —

- **reference** — the actual platform server (spawned as a subprocess),
  with its suggestion-bearing errors, `llms.txt` self-description, and
  dry-run mode.
- **baseline** — a deliberately vanilla API in `src/baseline-server.ts`
  with the *same endpoints* but terse `{"error": "Bad Request"}` responses,
  no suggestions, no discovery, no dry-run. The control group.

Both agents get an identical endpoint skeleton in their prompt, so the
comparison isolates the platform's agent-experience features rather than
documentation asymmetry. The agent has one generic `http_request` tool and
must figure out the rest — field names, auth headers, recovery from its
own mistakes.

**Metrics per scenario:** verified task success (checked through the API
by an independent verifier), zero-shot success (verified *and* the agent
never received a 4xx/5xx along the way — the eval analog of the
`agent_zero_shot_success_rate` gauge), API errors encountered, HTTP calls,
and token usage.

## Running

```bash
ANTHROPIC_API_KEY=... npm run eval        # from the repo root
EVAL_MODEL=claude-sonnet-4-6 npm run eval # override the model (default claude-haiku-4-5)
```

Results land in `apps/eval/results/latest.{md,json}` and print as a
markdown table. CI runs this weekly via `.github/workflows/ax-eval.yml`
when the `ANTHROPIC_API_KEY` secret is configured.

The harness itself (baseline server, scenario verifiers, reference
spawning, report math) is fully covered by keyless tests in the normal
suite — only the model loop needs the key.
