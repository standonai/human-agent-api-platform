/**
 * Validation middleware for request/response validation with Zod
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError } from '../middleware/error-handler.js';
import { ErrorCode } from '../types/errors.js';

export interface ValidationSchemas {
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  response?: z.ZodTypeAny;
}

declare global {
  namespace Express {
    interface Request {
      validated?: {
        query?: any;
        params?: any;
        body?: any;
      };
    }
  }
}

/**
 * Create validation middleware from Zod schemas
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.validated = {};

    try {
      // Validate query parameters
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw createValidationError(result.error, 'query', req.requestId);
        }
        req.validated.query = result.data;
      }

      // Validate path parameters
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw createValidationError(result.error, 'params', req.requestId);
        }
        req.validated.params = result.data;
      }

      // Validate request body
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw createValidationError(result.error, 'body', req.requestId);
        }
        req.validated.body = result.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create an ApiError from Zod validation error
 */
function createValidationError(
  error: z.ZodError,
  location: string,
  _requestId: string
): ApiError {
  const details = error.errors.map(err => {
    const path = err.path.join('.');
    const fieldName = path || location;

    return {
      code: mapZodErrorCode(err.code),
      message: err.message,
      suggestion: generateSuggestion(err),
      target: fieldName,
    };
  });

  const mainError = error.errors[0];
  const path = mainError.path.join('.');
  const target = path ? `${location}.${path}` : location;

  return new ApiError(
    400,
    ErrorCode.INVALID_PARAMETER,
    `Validation failed for ${target}`,
    target,
    details
  );
}

/**
 * Map Zod error codes to our error codes
 */
function mapZodErrorCode(zodCode: string): string {
  const mapping: Record<string, string> = {
    invalid_type: 'INVALID_TYPE',
    invalid_string: 'INVALID_FORMAT',
    too_small: 'VALUE_TOO_SMALL',
    too_big: 'VALUE_TOO_LARGE',
    invalid_enum_value: 'INVALID_ENUM',
    invalid_date: 'INVALID_DATE',
    custom: 'VALIDATION_ERROR',
  };

  return mapping[zodCode] || 'VALIDATION_ERROR';
}

/**
 * Generate actionable suggestion from Zod error
 */
function generateSuggestion(error: z.ZodIssue): string {
  switch (error.code) {
    case 'invalid_type':
      return `Expected ${error.expected}, but received ${error.received}. Provide a value of type ${error.expected}.`;

    case 'too_small':
      if (error.type === 'string') {
        return `String must be at least ${error.minimum} characters long.`;
      } else if (error.type === 'number') {
        return `Number must be at least ${error.minimum}.`;
      } else if (error.type === 'array') {
        return `Array must contain at least ${error.minimum} items.`;
      }
      return `Value is too small. Minimum: ${error.minimum}.`;

    case 'too_big':
      if (error.type === 'string') {
        return `String must be at most ${error.maximum} characters long.`;
      } else if (error.type === 'number') {
        return `Number must be at most ${error.maximum}.`;
      } else if (error.type === 'array') {
        return `Array must contain at most ${error.maximum} items.`;
      }
      return `Value is too large. Maximum: ${error.maximum}.`;

    case 'invalid_enum_value':
      return `Value must be one of: ${error.options.join(', ')}.`;

    case 'invalid_string':
      if (error.validation === 'email') {
        return 'Provide a valid email address.';
      } else if (error.validation === 'url') {
        return 'Provide a valid URL.';
      } else if (error.validation === 'uuid') {
        return 'Provide a valid UUID.';
      }
      return 'String format is invalid.';

    default:
      return 'Please check the value and try again.';
  }
}

/**
 * Validate response before sending (development only)
 */
export function validateResponse(schema: z.ZodTypeAny) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    // Only validate in development
    if (process.env.NODE_ENV === 'production') {
      return next();
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      const result = schema.safeParse(body);

      if (!result.success) {
        console.error('Response validation failed:', result.error);
        console.error('Response body:', JSON.stringify(body, null, 2));
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Helper to create common schema validators
 */
export const commonSchemas = {
  /**
   * Pagination query parameters
   */
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),

  /**
   * ID path parameter
   */
  id: z.object({
    id: z.string().min(1),
  }),

  /**
   * UUID path parameter
   */
  uuid: z.object({
    id: z.string().uuid(),
  }),

  /**
   * Search query
   */
  search: z.object({
    q: z.string().min(1).max(100),
    fields: z.string().optional(),
  }),

  /**
   * Date range
   */
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),

  /**
   * Sort parameters
   */
  sort: z.object({
    sortBy: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('asc').optional(),
  }),
};
