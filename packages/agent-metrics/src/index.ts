/**
 * @standonai/agent-metrics
 *
 * Agent-experience (AX) metrics for Express APIs: detects AI-agent traffic,
 * records per-request metrics in a zero-dependency in-memory store, and
 * tracks the zero-shot success rate — whether agents succeed on their first
 * call (a retry is the same agent hitting the same endpoint within 60s).
 * Publish the rate to Prometheus via `onZeroShotRate(rate => gauge.set(rate))`.
 */

export * from './agent-types.js';
export * from './metrics-store.js';
export * from './metrics-middleware.js';
export * from './agent-tracking.js';
