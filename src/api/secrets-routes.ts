/**
 * Secret Lifecycle Management API Routes
 *
 * Admin-only endpoints for managing secret lifecycle
 */

import express, { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import { UserRole } from '../types/auth.js';
import { getSecretLifecycleManager } from '../secrets/secret-lifecycle.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

// All routes require admin authentication
router.use(requireAuth);
router.use(requireRole(UserRole.ADMIN));

/**
 * GET /api/secrets
 * List all registered secrets with metadata
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const lifecycleManager = getSecretLifecycleManager();

    const filters: any = {};
    if (req.query.environment) filters.environment = req.query.environment as string;
    if (req.query.service) filters.service = req.query.service as string;
    if (req.query.needsRotation === 'true') filters.needsRotation = true;
    if (req.query.expired === 'true') filters.expired = true;

    const secrets = lifecycleManager.listSecrets(filters);

    // Remove sensitive data from response
    const sanitizedSecrets = secrets.map((s) => ({
      name: s.name,
      version: s.version,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      expiresAt: s.expiresAt,
      expired: lifecycleManager.isExpired(s.name),
      needsRotation: lifecycleManager.needsRotation(s.name),
      rotationSchedule: s.rotationSchedule
        ? {
            enabled: s.rotationSchedule.enabled,
            intervalDays: s.rotationSchedule.intervalDays,
            nextRotation: s.rotationSchedule.nextRotation,
            lastRotation: s.rotationSchedule.lastRotation,
            strategy: s.rotationSchedule.strategy,
          }
        : null,
      scope: s.scope,
      tags: s.tags,
    }));

    res.json({
      data: sanitizedSecrets,
      meta: {
        total: sanitizedSecrets.length,
        needsRotation: sanitizedSecrets.filter((s) => s.needsRotation).length,
        expired: sanitizedSecrets.filter((s) => s.expired).length,
      },
    });
  })
);

/**
 * GET /api/secrets/:name
 * Get metadata for a specific secret
 */
router.get(
  '/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const lifecycleManager = getSecretLifecycleManager();
    const metadata = lifecycleManager.getMetadata(req.params.name);

    if (!metadata) {
      res.status(404).json({
        error: {
          code: 'SECRET_NOT_FOUND',
          message: `Secret ${req.params.name} not found`,
        },
      });
      return;
    }

    res.json({
      data: {
        name: metadata.name,
        version: metadata.version,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        expiresAt: metadata.expiresAt,
        expired: lifecycleManager.isExpired(metadata.name),
        needsRotation: lifecycleManager.needsRotation(metadata.name),
        rotationSchedule: metadata.rotationSchedule,
        scope: metadata.scope,
        tags: metadata.tags,
      },
    });
  })
);

/**
 * POST /api/secrets/:name/rotate
 * Manually rotate a secret
 */
router.post(
  '/:name/rotate',
  asyncHandler(async (req: Request, res: Response) => {
    const lifecycleManager = getSecretLifecycleManager();
    const { force } = req.body;

    const result = await lifecycleManager.rotateSecret(
      req.params.name,
      undefined,
      { force }
    );

    if (result.success) {
      res.json({
        data: result,
        message: `Secret ${req.params.name} rotated successfully`,
      });
    } else {
      res.status(500).json({
        error: {
          code: 'ROTATION_FAILED',
          message: result.error || 'Secret rotation failed',
          details: [result],
        },
      });
    }
  })
);

/**
 * POST /api/secrets/:name/register
 * Register a secret for lifecycle management
 */
router.post(
  '/:name/register',
  asyncHandler(async (req: Request, res: Response) => {
    const lifecycleManager = getSecretLifecycleManager();
    const { rotationSchedule, scope, expiresAt, tags } = req.body;

    try {
      lifecycleManager.registerSecret(req.params.name, {
        rotationSchedule,
        scope,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        tags,
      });

      res.status(201).json({
        message: `Secret ${req.params.name} registered successfully`,
        data: lifecycleManager.getMetadata(req.params.name),
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'REGISTRATION_FAILED',
          message: (error as Error).message,
        },
      });
    }
  })
);

/**
 * GET /api/secrets/status/overview
 * Get overview of all secrets status
 */
router.get(
  '/status/overview',
  asyncHandler(async (_req: Request, res: Response) => {
    const lifecycleManager = getSecretLifecycleManager();
    const allSecrets = lifecycleManager.listSecrets();

    const overview = {
      total: allSecrets.length,
      needsRotation: allSecrets.filter((s) =>
        lifecycleManager.needsRotation(s.name)
      ).length,
      expired: allSecrets.filter((s) => lifecycleManager.isExpired(s.name)).length,
      rotationEnabled: allSecrets.filter((s) => s.rotationSchedule?.enabled).length,
      byEnvironment: {} as Record<string, number>,
      byService: {} as Record<string, number>,
      upcomingRotations: allSecrets
        .filter((s) => s.rotationSchedule?.nextRotation)
        .sort((a, b) => {
          const aTime = a.rotationSchedule!.nextRotation!.getTime();
          const bTime = b.rotationSchedule!.nextRotation!.getTime();
          return aTime - bTime;
        })
        .slice(0, 10)
        .map((s) => ({
          name: s.name,
          nextRotation: s.rotationSchedule!.nextRotation,
          daysUntilRotation: Math.ceil(
            (s.rotationSchedule!.nextRotation!.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          ),
        })),
    };

    // Count by environment
    allSecrets.forEach((s) => {
      s.scope.environments.forEach((env) => {
        overview.byEnvironment[env] = (overview.byEnvironment[env] || 0) + 1;
      });
    });

    // Count by service
    allSecrets.forEach((s) => {
      s.scope.services.forEach((service) => {
        overview.byService[service] = (overview.byService[service] || 0) + 1;
      });
    });

    res.json({ data: overview });
  })
);

export default router;
