/**
 * API routes for OpenAPI-to-Tool conversion
 */

import { Router, Request, Response } from 'express';
import { parseOpenAPISpec } from '../tools/openapi-parser.js';
import { convertMultipleToOpenAI } from '../tools/openai-converter.js';
import { convertMultipleToAnthropic } from '../tools/anthropic-converter.js';
import { asyncHandler, ApiError } from '../middleware/index.js';
import { ErrorCode } from '../types/errors.js';

const router = Router();

/**
 * POST /api/convert
 * Convert OpenAPI spec to tool definitions
 */
router.post(
  '/convert',
  asyncHandler(async (req: Request, res: Response) => {
    const { spec, format = 'both', filter } = req.body;

    // Validate input
    if (!spec) {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'OpenAPI specification is required',
        'spec',
        [
          {
            code: 'MISSING_FIELD',
            message: 'spec field is required in request body',
            suggestion: 'Provide an OpenAPI 3.1 specification object',
            target: 'spec',
          },
        ]
      );
    }

    // Validate OpenAPI version
    if (!spec.openapi || !spec.openapi.startsWith('3.')) {
      throw new ApiError(
        400,
        ErrorCode.INVALID_FORMAT,
        'Invalid OpenAPI specification',
        'spec.openapi',
        [
          {
            code: 'UNSUPPORTED_VERSION',
            message: 'Only OpenAPI 3.x is supported',
            suggestion: 'Use OpenAPI 3.0 or 3.1 specification format',
            target: 'spec.openapi',
          },
        ]
      );
    }

    try {
      // Parse OpenAPI spec
      let tools = parseOpenAPISpec(spec);

      // Apply filters if provided
      if (filter) {
        if (filter.tags) {
          tools = tools.filter(tool => {
            const operation = spec.paths?.[tool.path]?.[tool.method.toLowerCase()];
            const operationTags = operation?.tags || [];
            return filter.tags.some((tag: string) => operationTags.includes(tag));
          });
        }

        if (filter.methods) {
          tools = tools.filter(tool => filter.methods.includes(tool.method));
        }

        if (filter.paths) {
          tools = tools.filter(tool => {
            return filter.paths.some((pattern: string) => {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(tool.path);
            });
          });
        }
      }

      // Convert to requested format(s)
      const result: any = {
        operationsCount: tools.length,
        apiTitle: spec.info?.title || 'Untitled API',
        apiVersion: spec.info?.version || '1.0.0',
      };

      if (format === 'openai' || format === 'both') {
        result.openai = convertMultipleToOpenAI(tools);
      }

      if (format === 'anthropic' || format === 'both') {
        result.anthropic = convertMultipleToAnthropic(tools);
      }

      if (format === 'generic') {
        result.generic = tools;
      }

      res.json(result);
    } catch (error) {
      throw new ApiError(
        400,
        ErrorCode.INVALID_FORMAT,
        'Failed to parse OpenAPI specification',
        'spec',
        [
          {
            code: 'PARSE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            suggestion: 'Ensure the specification is valid OpenAPI 3.x format',
            target: 'spec',
          },
        ]
      );
    }
  })
);

/**
 * POST /api/convert/validate
 * Validate OpenAPI spec without conversion
 */
router.post(
  '/convert/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const { spec } = req.body;

    if (!spec) {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'OpenAPI specification is required',
        'spec'
      );
    }

    const issues: Array<{ severity: string; message: string; path?: string }> = [];

    // Check OpenAPI version
    if (!spec.openapi) {
      issues.push({
        severity: 'error',
        message: 'Missing openapi field',
        path: 'openapi',
      });
    } else if (!spec.openapi.startsWith('3.')) {
      issues.push({
        severity: 'error',
        message: 'Only OpenAPI 3.x is supported',
        path: 'openapi',
      });
    }

    // Check info
    if (!spec.info) {
      issues.push({
        severity: 'error',
        message: 'Missing info object',
        path: 'info',
      });
    } else {
      if (!spec.info.title) {
        issues.push({
          severity: 'warning',
          message: 'Missing API title',
          path: 'info.title',
        });
      }
      if (!spec.info.version) {
        issues.push({
          severity: 'warning',
          message: 'Missing API version',
          path: 'info.version',
        });
      }
    }

    // Check paths
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      issues.push({
        severity: 'error',
        message: 'No paths defined',
        path: 'paths',
      });
    } else {
      // Check for operations without operationId
      for (const [path, pathItem] of Object.entries(spec.paths)) {
        const methods = ['get', 'post', 'put', 'patch', 'delete'];
        for (const method of methods) {
          const operation = (pathItem as any)?.[method];
          if (operation && !operation.operationId) {
            issues.push({
              severity: 'warning',
              message: `Operation missing operationId`,
              path: `paths.${path}.${method}.operationId`,
            });
          }
          if (operation && !operation.description && !operation.summary) {
            issues.push({
              severity: 'warning',
              message: `Operation missing description`,
              path: `paths.${path}.${method}.description`,
            });
          }
        }
      }
    }

    // Try to parse
    try {
      const tools = parseOpenAPISpec(spec);

      res.json({
        valid: issues.filter(i => i.severity === 'error').length === 0,
        issues,
        operationsCount: tools.length,
        operations: tools.map(t => ({
          name: t.name,
          method: t.method,
          path: t.path,
          description: t.description.split('\n')[0],
        })),
      });
    } catch (error) {
      issues.push({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Parse error',
      });

      res.json({
        valid: false,
        issues,
        operationsCount: 0,
        operations: [],
      });
    }
  })
);

/**
 * GET /api/convert/info
 * Get information about the converter
 */
router.get('/convert/info', (_req: Request, res: Response) => {
  res.json({
    name: 'OpenAPI to AI Agent Tool Converter',
    version: '1.0.0',
    supportedFormats: ['openai', 'anthropic', 'generic'],
    supportedOpenAPIVersions: ['3.0.x', '3.1.x'],
    features: [
      'Convert OpenAPI specs to OpenAI function calling format',
      'Convert OpenAPI specs to Anthropic Claude tool format',
      'Filter by tags, methods, or path patterns',
      'Validate OpenAPI specifications',
      'Rich parameter descriptions with constraints',
    ],
    filters: {
      tags: 'Filter operations by OpenAPI tags',
      methods: 'Filter operations by HTTP method (GET, POST, etc.)',
      paths: 'Filter operations by path pattern (supports wildcards)',
    },
  });
});

export default router;
