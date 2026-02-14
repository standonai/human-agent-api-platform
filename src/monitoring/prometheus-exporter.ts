/**
 * Prometheus Metrics Exporter
 *
 * Exports application metrics in Prometheus format for monitoring and alerting.
 *
 * Metrics Categories:
 * - HTTP Request metrics (duration, rate, errors)
 * - Business metrics (users, agents, API calls)
 * - System metrics (CPU, memory, event loop)
 * - Security metrics (auth failures, rate limits)
 * - Custom application metrics
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Create separate registry for application metrics
export const register = new Registry();

// Set default labels for all metrics
register.setDefaultLabels({
  app: 'api-platform',
  environment: process.env.NODE_ENV || 'development',
});

/**
 * HTTP Request Metrics
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code', 'agent_type'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code', 'agent_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestSizeBytes = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'path'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

export const httpResponseSizeBytes = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'path'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

/**
 * Authentication Metrics
 */
export const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'status'],
  registers: [register],
});

export const authFailures = new Counter({
  name: 'auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['type', 'reason'],
  registers: [register],
});

/**
 * Rate Limiting Metrics
 */
export const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['agent_type', 'limit_type'],
  registers: [register],
});

export const rateLimitRemaining = new Gauge({
  name: 'rate_limit_remaining',
  help: 'Remaining requests in current rate limit window',
  labelNames: ['client_id', 'agent_type'],
  registers: [register],
});

/**
 * Business Metrics
 */
export const activeUsers = new Gauge({
  name: 'active_users',
  help: 'Number of currently active users',
  registers: [register],
});

export const activeAgents = new Gauge({
  name: 'active_agents',
  help: 'Number of currently active AI agents',
  registers: [register],
});

export const apiCallsTotal = new Counter({
  name: 'api_calls_total',
  help: 'Total number of API calls',
  labelNames: ['endpoint', 'agent_type', 'status'],
  registers: [register],
});

/**
 * Database/External Service Metrics
 */
export const externalServiceDuration = new Histogram({
  name: 'external_service_duration_seconds',
  help: 'Duration of external service calls in seconds',
  labelNames: ['service', 'operation', 'status'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const externalServiceErrors = new Counter({
  name: 'external_service_errors_total',
  help: 'Total number of external service errors',
  labelNames: ['service', 'operation', 'error_type'],
  registers: [register],
});

/**
 * Security Metrics
 */
export const securityEvents = new Counter({
  name: 'security_events_total',
  help: 'Total number of security events',
  labelNames: ['event_type', 'severity'],
  registers: [register],
});

export const injectionAttempts = new Counter({
  name: 'injection_attempts_total',
  help: 'Total number of injection attack attempts',
  labelNames: ['type'],
  registers: [register],
});

/**
 * Agent Zero-Shot Success Rate
 *
 * Tracks whether AI agents succeed on their first API call attempt.
 * A "retry" is detected when the same agent hits the same endpoint within 60s.
 * Zero-shot success = no retry needed.
 */
export const agentZeroShotSuccessRate = new Gauge({
  name: 'agent_zero_shot_success_rate',
  help: 'Ratio of agent API calls that succeed on the first attempt (no retry within 60s)',
  registers: [register],
});

/**
 * Cache Metrics
 */
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

/**
 * System Metrics
 */
export const eventLoopLag = new Gauge({
  name: 'nodejs_eventloop_lag_seconds',
  help: 'Event loop lag in seconds',
  registers: [register],
});

export const heapUsedBytes = new Gauge({
  name: 'nodejs_heap_used_bytes',
  help: 'Heap memory used in bytes',
  registers: [register],
});

export const heapTotalBytes = new Gauge({
  name: 'nodejs_heap_total_bytes',
  help: 'Total heap memory in bytes',
  registers: [register],
});

export const activeHandles = new Gauge({
  name: 'nodejs_active_handles',
  help: 'Number of active handles',
  registers: [register],
});

/**
 * Enable default metrics collection
 * Includes process metrics, Node.js metrics, etc.
 */
export function enableDefaultMetrics(): void {
  collectDefaultMetrics({
    register,
    prefix: 'nodejs_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

/**
 * Prometheus metrics middleware
 * Automatically tracks HTTP request metrics
 */
export function prometheusMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    // Track request size
    const requestSize = parseInt(req.get('content-length') || '0');
    if (requestSize > 0) {
      httpRequestSizeBytes.observe(
        {
          method: req.method,
          path: req.route?.path || req.path,
        },
        requestSize
      );
    }

    // On response finish, record metrics
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const agentType = req.agentContext?.identification.agentType || 'unknown';
      const path = req.route?.path || req.path;

      // Record request count
      httpRequestsTotal.inc({
        method: req.method,
        path,
        status_code: res.statusCode,
        agent_type: agentType,
      });

      // Record request duration
      httpRequestDuration.observe(
        {
          method: req.method,
          path,
          status_code: res.statusCode,
          agent_type: agentType,
        },
        duration
      );

      // Track response size
      const responseSize = parseInt(res.get('content-length') || '0');
      if (responseSize > 0) {
        httpResponseSizeBytes.observe(
          {
            method: req.method,
            path,
          },
          responseSize
        );
      }

      // Track API calls
      apiCallsTotal.inc({
        endpoint: path,
        agent_type: agentType,
        status: res.statusCode < 400 ? 'success' : 'error',
      });
    });

    next();
  };
}

/**
 * Update system metrics periodically
 */
export function startSystemMetricsCollection(): NodeJS.Timeout {
  const interval = setInterval(() => {
    const memoryUsage = process.memoryUsage();

    heapUsedBytes.set(memoryUsage.heapUsed);
    heapTotalBytes.set(memoryUsage.heapTotal);

    // Measure event loop lag
    const start = Date.now();
    setImmediate(() => {
      const lag = (Date.now() - start) / 1000;
      eventLoopLag.set(lag);
    });

    // Active handles (connections, timers, etc.)
    const handles = (process as any)._getActiveHandles?.()?.length || 0;
    activeHandles.set(handles);
  }, 5000); // Update every 5 seconds

  return interval;
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics content type
 */
export function getContentType(): string {
  return register.contentType;
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}
