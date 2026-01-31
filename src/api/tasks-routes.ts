import { Router, Request, Response, NextFunction } from 'express';
import { ApiError, ErrorCode } from '../types/errors.js';

const router = Router();

// In-memory storage (replace with database in production)
interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

const tasks = new Map<string, Task>();
let taskCounter = 1;

/**
 * POST /api/v2/tasks
 * Create a new task
 */
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, status, assignee } = req.body;

    // Validation
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

    // Check dry-run mode
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

    // Create task
    const task: Task = {
      id: `task_${taskCounter++}`,
      title,
      description,
      status: status || 'todo',
      assignee,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tasks.set(task.id, task);

    res.status(201).json({
      data: task,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v2/tasks
 * List all tasks with optional filtering
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, assignee, limit = '50', offset = '0' } = req.query;

    let allTasks = Array.from(tasks.values());

    // Filter by status
    if (status && typeof status === 'string') {
      allTasks = allTasks.filter(t => t.status === status);
    }

    // Filter by assignee
    if (assignee && typeof assignee === 'string') {
      allTasks = allTasks.filter(t => t.assignee === assignee);
    }

    // Pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const paginatedTasks = allTasks.slice(offsetNum, offsetNum + limitNum);

    res.status(200).json({
      data: paginatedTasks,
      meta: {
        total: allTasks.length,
        limit: limitNum,
        offset: offsetNum,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v2/tasks/:id
 * Get a specific task by ID
 */
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const task = tasks.get(id);

    if (!task) {
      const error: ApiError = {
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: `Task with ID '${id}' not found`,
        target: 'id',
        details: [{
          code: 'RESOURCE_NOT_FOUND',
          message: 'Task does not exist',
          suggestion: 'Check that the task ID is correct. Use GET /api/v2/tasks to list all tasks.',
        }],
        request_id: req.requestId || 'unknown',
      };
      res.status(404).json({ error });
      return;
    }

    res.status(200).json({
      data: task,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v2/tasks/:id
 * Update a task
 */
router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const task = tasks.get(id);

    if (!task) {
      const error: ApiError = {
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: `Task with ID '${id}' not found`,
        target: 'id',
        details: [{
          code: 'RESOURCE_NOT_FOUND',
          message: 'Task does not exist',
          suggestion: 'Check that the task ID is correct. Use GET /api/v2/tasks to list all tasks.',
        }],
        request_id: req.requestId || 'unknown',
      };
      res.status(404).json({ error });
      return;
    }

    // Check dry-run mode
    if (req.query.dry_run === 'true') {
      res.status(200).json({
        data: {
          dry_run: true,
          message: 'Validation successful. Task would be updated.',
          current: task,
          would_update: updates,
        },
      });
      return;
    }

    // Update task
    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    tasks.set(id, updatedTask);

    res.status(200).json({
      data: updatedTask,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v2/tasks/:id
 * Delete a task
 */
router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const task = tasks.get(id);

    if (!task) {
      const error: ApiError = {
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: `Task with ID '${id}' not found`,
        target: 'id',
        details: [{
          code: 'RESOURCE_NOT_FOUND',
          message: 'Task does not exist',
          suggestion: 'Check that the task ID is correct. Use GET /api/v2/tasks to list all tasks.',
        }],
        request_id: req.requestId || 'unknown',
      };
      res.status(404).json({ error });
      return;
    }

    // Check dry-run mode
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

    // Delete task
    tasks.delete(id);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Export for testing
export { tasks };
export default router;
