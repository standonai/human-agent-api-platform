/**
 * Monitoring API Routes
 *
 * Endpoints for monitoring, metrics, and health checks
 */

import express, { Request, Response } from 'express';
import { getMetrics, getContentType } from '../monitoring/prometheus-exporter.js';
import { performHealthCheck, isReady, isAlive } from '../monitoring/health-checker.js';

const router = express.Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 *
 * Returns metrics in Prometheus text format
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', getContentType());
    const metrics = await getMetrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'METRICS_ERROR',
        message: 'Failed to retrieve metrics',
        details: [(error as Error).message],
      },
    });
  }
});

/**
 * GET /health
 * Comprehensive health check
 *
 * Returns detailed health status of all components
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await performHealthCheck();

    // Set appropriate HTTP status based on health
    const statusCode =
      health.status === 'healthy'
        ? 200
        : health.status === 'degraded'
        ? 200 // Still return 200 for degraded, but status field shows degradation
        : 503; // Service Unavailable for unhealthy

    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: 'Health check failed',
        details: [(error as Error).message],
      },
    });
  }
});

/**
 * GET /health/ready
 * Kubernetes readiness probe
 *
 * Returns 200 if service is ready to accept traffic
 * Returns 503 if service is not ready
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    const ready = await isReady();

    if (ready) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 *
 * Returns 200 if process is alive
 * Returns 503 if process should be restarted
 */
router.get('/health/live', async (_req: Request, res: Response) => {
  try {
    const alive = await isAlive();

    if (alive) {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'dead',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'dead',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
});

export default router;
