/**
 * Example user routes with Zod validation
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/index.js';
import { validate } from '../validation/validation-middleware.js';
import { userSchemas } from '../validation/schemas.js';

const router = Router();

// In-memory user store (for demo)
interface User {
  id: number;
  name: string;
  email: string;
  age?: number;
  createdAt: string;
}

let users: User[] = [
  {
    id: 1,
    name: 'Alice Johnson',
    email: 'alice@example.com',
    age: 28,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Bob Smith',
    email: 'bob@example.com',
    age: 35,
    createdAt: new Date().toISOString(),
  },
];

let nextId = 3;

/**
 * GET /users
 * List users with pagination and filtering
 */
router.get(
  '/',
  validate({ query: userSchemas.query }),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit, status } = req.validated!.query;

    // Apply filters (status filtering is just for demo)
    let filtered = users;
    if (status) {
      // In real app, filter by status
      filtered = users;
    }

    // Apply pagination
    const results = filtered.slice(0, limit);

    res.json({
      data: results.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
      })),
      meta: {
        total: filtered.length,
        limit,
      },
    });
  })
);

/**
 * POST /users
 * Create a new user with validation
 */
router.post(
  '/',
  validate({ body: userSchemas.create }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = req.validated!.body;

    // Check for duplicate email
    const existingUser = users.find(u => u.email === data.email);
    if (existingUser) {
      res.status(409).json({
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'A user with this email already exists',
          target: 'email',
          details: [
            {
              code: 'DUPLICATE_VALUE',
              message: `Email ${data.email} is already registered`,
              suggestion: 'Use a different email address or retrieve the existing user',
              target: 'email',
            },
          ],
          request_id: req.requestId,
        },
      });
      return;
    }

    // Handle dry-run
    if (req.isDryRun) {
      res.json({
        dry_run: true,
        validation: 'passed',
        message: 'User would be created successfully',
        data,
      });
      return;
    }

    // Create user
    const user: User = {
      id: nextId++,
      name: data.name,
      email: data.email,
      age: data.age,
      createdAt: new Date().toISOString(),
    };

    users.push(user);

    res.status(201).json({ data: user });
  })
);

/**
 * GET /users/:id
 * Get a specific user
 */
router.get(
  '/:id',
  // Note: params validation would need a proper id schema
  // validate({ params: z.object({ id: z.string() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    const user = users.find(u => u.id === userId);

    if (!user) {
      res.status(404).json({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `User with ID ${userId} not found`,
          target: 'id',
          details: [
            {
              code: 'NOT_FOUND',
              message: 'The requested user does not exist',
              suggestion: 'Check the user ID and try again, or list all users to find the correct ID',
              target: 'id',
            },
          ],
          request_id: req.requestId,
        },
      });
      return;
    }

    res.json({ data: user });
  })
);

/**
 * PUT /users/:id
 * Update a user
 */
router.put(
  '/:id',
  validate({
    // Note: params validation would need a proper id schema
    body: userSchemas.update,
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const updates = req.validated!.body;

    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      res.status(404).json({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `User with ID ${userId} not found`,
          target: 'id',
          request_id: req.requestId,
        },
      });
      return;
    }

    // Handle dry-run
    if (req.isDryRun) {
      res.json({
        dry_run: true,
        validation: 'passed',
        message: 'User would be updated successfully',
        updates,
      });
      return;
    }

    // Update user
    users[userIndex] = {
      ...users[userIndex],
      ...updates,
    };

    res.json({ data: users[userIndex] });
  })
);

/**
 * DELETE /users/:id
 * Delete a user
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      res.status(404).json({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `User with ID ${userId} not found`,
          target: 'id',
          request_id: req.requestId,
        },
      });
      return;
    }

    // Handle dry-run
    if (req.isDryRun) {
      res.json({
        dry_run: true,
        validation: 'passed',
        message: 'User would be deleted successfully',
      });
      return;
    }

    // Delete user
    users.splice(userIndex, 1);

    res.status(204).send();
  })
);

export default router;
