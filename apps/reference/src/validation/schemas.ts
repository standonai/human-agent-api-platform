/**
 * Common Zod schemas for the API platform
 */

import { z } from 'zod';

/**
 * User schemas
 */
export const userSchemas = {
  create: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    age: z.number().int().min(0).max(150).optional(),
  }),

  update: z.object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    age: z.number().int().min(0).max(150).optional(),
  }),

  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['active', 'inactive', 'pending']).optional(),
  }),

  response: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    email: z.string().email(),
    age: z.number().int().optional(),
    createdAt: z.string().datetime(),
  }),

  list: z.object({
    data: z.array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        email: z.string().email().optional(),
      })
    ),
    meta: z.object({
      total: z.number().int(),
      limit: z.number().int(),
      page: z.number().int().optional(),
    }),
  }),
};

/**
 * API metadata schemas
 */
export const metaSchemas = {
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),

  timestamp: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
  }),
};

/**
 * Health check schema
 */
export const healthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  timestamp: z.string().datetime(),
  checks: z
    .record(
      z.object({
        status: z.enum(['pass', 'fail']),
        message: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * Agent context schema
 */
export const agentSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'custom', 'human']),
  id: z.string().optional(),
  userAgent: z.string(),
});

/**
 * Error response schema (for validation)
 */
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    target: z.string().optional(),
    details: z
      .array(
        z.object({
          code: z.string(),
          message: z.string(),
          suggestion: z.string(),
          target: z.string().optional(),
        })
      )
      .optional(),
    doc_url: z.string().url().optional(),
    request_id: z.string(),
  }),
});
