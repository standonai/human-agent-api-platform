# Rate Limiting

Simple, agent-aware rate limiting that just works.

## Quick Start

```typescript
import { rateLimit } from './middleware/index.js';

// Zero config - uses sensible defaults
app.use(rateLimit());
```

**Defaults:**
- Human users: 100 requests/minute
- AI agents: 500 requests/minute
- Automatic agent detection via `agentTrackingMiddleware`

## Custom Configuration

```typescript
// Override defaults
app.use(rateLimit({
  humanLimit: 200,
  agentLimit: 1000,
  windowMs: 60000, // 1 minute
}));

// Per-agent custom limits
app.use(rateLimit({
  customLimits: new Map([
    ['premium-agent', 2000],
    ['trial-agent', 50],
  ]),
}));
```

## Response Format

**Successful requests** include headers:
```http
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 387
X-RateLimit-Reset: 2025-01-30T10:15:00.000Z
```

**Rate limited requests** return:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 0
```

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": [{
      "code": "TOO_MANY_REQUESTS",
      "message": "You have exceeded the rate limit of 500 requests per 60 seconds",
      "suggestion": "Wait 42 seconds before retrying. Implement exponential backoff to avoid retry storms.",
      "target": "rate_limit"
    }]
  }
}
```

## For AI Agents

The middleware enables agent self-correction:

1. **Proactive**: Read `X-RateLimit-Remaining` to slow down before hitting limits
2. **Reactive**: Use `Retry-After` header to know exactly when to retry
3. **Adaptive**: Implement exponential backoff as suggested in error messages

## Implementation Details

- **Algorithm**: Fixed window (simple, predictable)
- **Storage**: In-memory Map (zero dependencies)
- **Cleanup**: On-demand when store exceeds 10,000 entries
- **Identification**: IP address + agent ID when available

## Testing

```typescript
import { rateLimit, resetRateLimits } from './middleware/rate-limiter.js';

// Reset between tests
beforeEach(() => {
  resetRateLimits();
});
```

## Production Considerations

**Current implementation is suitable for:**
- Single-server deployments
- Development/staging environments
- Low to medium traffic (<100K requests/hour)

**For large-scale production:**
- Consider Redis-backed storage for multi-server deployments
- The current API makes it easy to swap implementations

## Why This Design

Following the platform's simplicity principles:
- **Zero config required** - sensible defaults for 90% of use cases
- **Agent-aware** - different limits for humans vs. agents automatically
- **Clear errors** - agents know exactly when to retry
- **Just works** - no complexity users don't value
