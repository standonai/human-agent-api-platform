# @standonai/agent-metrics

Agent-experience (AX) metrics for Express APIs:

- **Agent detection** — identifies AI-agent traffic from `X-Agent-ID` /
  User-Agent and exposes it as `req.agentContext`.
- **Zero-shot success rate** — did the agent succeed on its *first* call?
  A retry is the same agent hitting the same endpoint within 60 seconds.
- **In-memory request metrics** — zero-dependency store with summaries,
  percentiles, per-endpoint and per-agent breakdowns.

## Usage

```ts
import {
  agentTrackingMiddleware,
  metricsMiddleware,
  metricsStore,
  onZeroShotRate,
} from '@standonai/agent-metrics';

app.use(agentTrackingMiddleware); // sets req.agentContext, tracks zero-shot
app.use(metricsMiddleware);       // records per-request metrics

// Dashboard / API
app.get('/metrics-summary', (_req, res) => res.json(metricsStore.getMetrics(60)));
```

## Prometheus

The package has no Prometheus dependency; subscribe and publish with your
own registry:

```ts
import { Gauge } from 'prom-client';
import { onZeroShotRate } from '@standonai/agent-metrics';

const zeroShot = new Gauge({ name: 'agent_zero_shot_success_rate', help: '…' });
onZeroShotRate((rate) => zeroShot.set(rate));
```
