# @standonai/agent-errors

Agent-parseable API error envelope. Every error carries a machine-readable
`code`, a human-readable `message`, and a **mandatory `suggestion`** so AI
agents can self-correct without human help.

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "limit must be between 1 and 100",
    "target": "limit",
    "details": [{
      "code": "VALUE_OUT_OF_RANGE",
      "message": "limit must be between 1 and 100",
      "suggestion": "Set limit to 100 or use pagination"
    }],
    "doc_url": "https://docs.example.com/errors/INVALID_PARAMETER",
    "request_id": "req_abc123"
  }
}
```

## Usage (Express)

```ts
import { errorHandler, asyncHandler, ApiError, ErrorCode } from '@standonai/agent-errors';

app.get('/api/things/:id', asyncHandler(async (req, res) => {
  const thing = findThing(req.params.id);
  if (!thing) {
    throw new ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Thing not found', 'id', [{
      code: 'UNKNOWN_ID',
      message: `No thing with id ${req.params.id}`,
      suggestion: 'List things via GET /api/things to discover valid ids',
    }]);
  }
  res.json({ data: thing });
}));

// Must be registered last
app.use(errorHandler({ docBaseUrl: 'https://docs.example.com' }));
```

Build envelopes directly with `ErrorBuilder` / `createErrorResponse`, or
import only the types from `@standonai/agent-errors/errors`.

## Spectral ruleset

Enforce the envelope (including the mandatory `suggestion`) in your OpenAPI
spec by extending the shipped ruleset in `.spectral.yaml`:

```yaml
extends:
  - ./node_modules/@standonai/agent-errors/spectral.yaml
```
