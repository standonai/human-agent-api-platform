import { Router, Request, Response, NextFunction } from 'express';
import { ApiError, ErrorCode } from '../types/errors.js';
import { requireAuth } from '../middleware/auth.js';
import {
  requireResourceAccess,
  validateFieldUpdates,
  filterResponseFields,
} from '../authorization/index.js';
import {
  dbGetTask,
  dbListTasks,
  dbCreateTask,
  dbUpdateTask,
  dbDeleteTask,
  Task,
} from '../db/task-store.js';

const router = Router();

// Stub Map exported for backward-compat with tests that manipulate it directly.
// Route handlers use the DB; test code operates on this Map.
const tasks = new Map<string, Task>();

/**
 * POST /api/v2/tasks
 * Create a new task
 */
router.post(
  '/',
  requireAuth,
  requireResourceAccess('task', 'create'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, status, assignee } = req.body;

      if (!title || typeof title !== 'string') {
        const error: ApiError = {
          code: ErrorCode.INVALID_PARAMETER,
          message: 'Title is required',
          target: 'title',
          details: [{
            code: 'VALIDATION_ERROR',
            message: 'Title must be a non-empty string',
            suggestion: 'Provide a title between 1-200 characters',
          }],
          request_id: req.requestId || 'unknown',
        };
        res.status(400).json({ error });
        return;
      }

      if (req.query.dry_run === 'true') {
        res.status(200).json({
          data: {
            dry_run: true,
            message: 'Validation successful. Task would be created.',
            would_create: { title, description, status, assignee },
          },
        });
        return;
      }

      const creatorId = req.user?.id || req.agent?.id || 'unknown';
      const now = new Date().toISOString();

      const task = dbCreateTask({
        title,
        description,
        status: status || 'todo',
        assignee,
        createdBy: creatorId,
        ownerId:   creatorId,
        createdAt: now,
        updatedAt: now,
      });

      res.status(201).json({ data: task });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v2/tasks
 * List all tasks with optional filtering
 */
router.get(
  '/',
  requireAuth,
  requireResourceAccess('task', 'list'),
  filterResponseFields('task'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, assignee, limit = '50', offset = '0' } = req.query;
      const limitNum  = parseInt(limit as string, 10);
      const offsetNum = parseInt(offset as string, 10);

      const isAdmin  = req.user?.role === 'admin';
      const callerId = req.user?.id || req.agent?.id;

      const { tasks: paginated, total } = dbListTasks({
        status:   typeof status === 'string' ? status : undefined,
        assignee: typeof assignee === 'string' ? assignee : undefined,
        callerId,
        isAdmin,
        limit:    limitNum,
        offset:   offsetNum,
      });

      res.status(200).json({
        data: paginated,
        meta: { total, limit: limitNum, offset: offsetNum },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v2/tasks/:id
 * Get a specific task by ID
 */
router.get(
  '/:id',
  requireAuth,
  requireResourceAccess('task', 'read', (req) => dbGetTask(req.params.id)),
  filterResponseFields('task'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = (req as any).resource;
      res.status(200).json({ data: task });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v2/tasks/:id
 * Update a task
 */
router.put(
  '/:id',
  requireAuth,
  requireResourceAccess('task', 'update', (req) => dbGetTask(req.params.id)),
  validateFieldUpdates('task'),
  filterResponseFields('task'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const task    = (req as any).resource;

      if (req.query.dry_run === 'true') {
        res.status(200).json({
          data: {
            dry_run: true,
            message: 'Validation successful. Task would be updated.',
            current:     task,
            would_update: updates,
          },
        });
        return;
      }

      const updaterId  = req.user?.id || req.agent?.id || 'unknown';
      const updatedTask = dbUpdateTask(id, {
        ...task,
        ...updates,
        updatedBy: updaterId,
        updatedAt: new Date().toISOString(),
      });

      res.status(200).json({ data: updatedTask });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/v2/tasks/:id
 * Delete a task
 */
router.delete(
  '/:id',
  requireAuth,
  requireResourceAccess('task', 'delete', (req) => dbGetTask(req.params.id)),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const task   = (req as any).resource;

      if (req.query.dry_run === 'true') {
        res.status(200).json({
          data: {
            dry_run: true,
            message: 'Validation successful. Task would be deleted.',
            would_delete: task,
          },
        });
        return;
      }

      dbDeleteTask(id);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// Export stub Map for backward-compat with existing tests
export { tasks };
export default router;
