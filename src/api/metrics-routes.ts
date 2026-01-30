/**
 * Metrics API Routes
 *
 * Exposes observability metrics via REST API
 */

import { Router, Request, Response } from 'express';
import { metricsStore } from '../observability/metrics-store.js';

const router = Router();

/**
 * GET /api/metrics
 * Get aggregated metrics
 */
router.get('/', (req: Request, res: Response) => {
  const windowMinutes = parseInt(req.query.window as string) || 60;

  // Validate window size
  if (windowMinutes < 1 || windowMinutes > 1440) {
    res.status(400).json({
      error: {
        code: 'INVALID_PARAMETER',
        message: 'Window parameter must be between 1 and 1440 minutes',
        target: 'window',
        details: [
          {
            code: 'VALUE_OUT_OF_RANGE',
            message: 'window must be between 1 (1 minute) and 1440 (24 hours)',
            suggestion: 'Set window to a value between 1 and 1440, or omit it to use the default of 60 minutes',
            target: 'window',
          },
        ],
        request_id: req.requestId,
      },
    });
    return;
  }

  const metrics = metricsStore.getMetrics(windowMinutes);

  res.json({
    data: metrics,
    meta: {
      windowMinutes,
      generatedAt: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/metrics/health
 * Health check for metrics system
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    dataPoints: metricsStore.getPointCount(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * DELETE /api/metrics (for testing/development only)
 * Reset all metrics
 */
router.delete('/', (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Metrics reset is not allowed in production',
      },
    });
    return;
  }

  metricsStore.reset();
  res.status(204).send();
});

export default router;
