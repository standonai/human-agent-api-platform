/**
 * Gateway Management API Routes
 */

import { Router, Request, Response } from 'express';
import { getGatewayManager } from '../gateway/gateway-manager.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

/**
 * GET /api/gateway/status
 * Get gateway connection status
 */
router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    const manager = getGatewayManager();
    const health = await manager.getHealth();

    res.json({
      data: health,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/gateway/sync
 * Manually trigger OpenAPI spec sync
 */
router.post(
  '/sync',
  asyncHandler(async (_req: Request, res: Response) => {
    const manager = getGatewayManager();

    if (!manager.isEnabled()) {
      res.status(400).json({
        error: {
          code: 'GATEWAY_NOT_CONFIGURED',
          message: 'Gateway is not configured',
          details: [
            {
              code: 'MISSING_CONFIGURATION',
              message: 'No gateway provider configured',
              suggestion:
                'Set GATEWAY_PROVIDER environment variable to kong or apigee',
            },
          ],
        },
      });
      return;
    }

    const result = await manager.syncOpenAPISpec();

    if (result.success) {
      res.json({
        data: result,
        message: 'OpenAPI spec synced successfully',
      });
    } else {
      res.status(500).json({
        error: {
          code: 'SYNC_FAILED',
          message: 'Failed to sync OpenAPI spec',
          details: result.errors.map((err) => ({
            code: 'SYNC_ERROR',
            message: err,
            suggestion: 'Check gateway configuration and connectivity',
          })),
        },
      });
    }
  })
);

export default router;
