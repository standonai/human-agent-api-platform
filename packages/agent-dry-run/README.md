# @standonai/agent-dry-run

Dry-run mode for Express mutations. Agents (and humans) append
`?dry_run=true` to any mutating request to validate it without executing —
the safety primitive that lets an agent check its work before acting.

## Usage

```ts
import { dryRunMiddleware, withDryRun, isDryRun } from '@standonai/agent-dry-run';

app.use(dryRunMiddleware);

// Option A: wrap a handler — validation always runs, execution is skipped on dry-run
app.post('/api/tasks', withDryRun(
  (req) => validateTask(req.body),          // validator (throws on invalid)
  (req, validated) => createTask(validated) // executor (skipped on dry-run)
));

// Option B: branch manually
app.post('/api/things', (req, res) => {
  const input = validate(req.body);
  if (isDryRun(req)) {
    res.json({ dry_run: true, validation: 'passed', would_create: input });
    return;
  }
  res.json({ data: create(input) });
});
```

Dry-run responses include the `X-Dry-Run: true` header.
