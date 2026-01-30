/**
 * Reference API Server
 * Demonstrates all middleware and platform standards
 */

import express, { Request, Response } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  requestIdMiddleware,
  versioningMiddleware,
  agentTrackingMiddleware,
  errorHandler,
  dryRunMiddleware,
  asyncHandler,
  ApiError,
  VersionConfig,
  rateLimit,
} from './middleware/index.js';
import { ErrorCode } from './types/errors.js';
import converterRoutes from './api/converter-routes.js';
import usersRoutes from './api/users-routes.js';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse JSON bodies
app.use(express.json());

// Apply core middleware
app.use(requestIdMiddleware);

// Configure API versioning
const versionConfig: VersionConfig = {
  defaultVersion: '2025-01-29',
  supportedVersions: [
    { version: '2025-01-29' },
    { version: '2024-12-01', deprecated: true },
  ],
  deprecatedVersions: new Map([
    [
      '2024-12-01',
      {
        deprecationDate: new Date('2024-12-01'),
        sunsetDate: new Date('2025-06-01'),
        migrationGuide: 'https://docs.example.com/migration/2025-01-29',
        replacementVersion: '2025-01-29',
      },
    ],
  ]),
};

app.use(versioningMiddleware(versionConfig));
app.use(agentTrackingMiddleware);

// Rate limiting with agent-aware defaults (100 human / 500 agent requests per minute)
// Optional: customize for premium agents
app.use(
  rateLimit({
    customLimits: new Map([
      ['premium-agent', 2000],  // Premium tier
      ['internal-tool', 5000],  // Internal services
    ]),
  })
);

app.use(dryRunMiddleware);

// Serve static files (web UI)
app.use(express.static(join(__dirname, '../public')));

// Mount API routes
app.use('/api', converterRoutes);
app.use('/api/v2/users', usersRoutes);

// Example endpoints demonstrating platform standards (legacy)

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    version: req.apiVersion,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Example GET endpoint with validation
 */
app.get(
  '/api/users',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;

    // Validate limit parameter
    if (limit < 1 || limit > 100) {
      throw new ApiError(
        400,
        ErrorCode.INVALID_PARAMETER,
        'The limit parameter is out of range',
        'limit',
        [
          {
            code: 'VALUE_OUT_OF_RANGE',
            message: 'limit must be between 1 and 100',
            suggestion: 'Set limit to a value between 1 and 100, or omit it to use the default of 20',
            target: 'limit',
          },
        ]
      );
    }

    // Example response
    res.json({
      data: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      meta: {
        total: 2,
        limit,
      },
    });
  })
);

/**
 * Example POST endpoint with dry-run support
 */
app.post(
  '/api/users',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email } = req.body;

    // Validation
    if (!name || typeof name !== 'string') {
      throw new ApiError(
        400,
        ErrorCode.MISSING_REQUIRED_FIELD,
        'The name field is required',
        'name',
        [
          {
            code: 'MISSING_FIELD',
            message: 'name is required',
            suggestion: 'Add a name field to the request body',
            target: 'name',
          },
        ]
      );
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new ApiError(
        400,
        ErrorCode.INVALID_FORMAT,
        'The email field has an invalid format',
        'email',
        [
          {
            code: 'INVALID_EMAIL',
            message: 'email must be a valid email address',
            suggestion: 'Provide a valid email address in the format user@example.com',
            target: 'email',
          },
        ]
      );
    }

    // Handle dry-run mode
    if (req.isDryRun) {
      res.json({
        dry_run: true,
        validation: 'passed',
        message: 'User would be created successfully',
      });
      return;
    }

    // Create user (simulated)
    const user = {
      id: Math.floor(Math.random() * 1000),
      name,
      email,
      createdAt: new Date().toISOString(),
    };

    res.status(201).json({ data: user });
  })
);

/**
 * Example endpoint that demonstrates agent-specific behavior
 */
app.get('/api/agents/info', (req: Request, res: Response) => {
  const agentContext = req.agentContext;

  res.json({
    message: 'Agent information endpoint',
    agent: {
      type: agentContext?.identification.agentType || 'unknown',
      id: agentContext?.identification.agentId,
      userAgent: agentContext?.identification.userAgent,
    },
    request: {
      id: req.requestId,
      version: req.apiVersion,
      timestamp: agentContext?.timestamp,
    },
  });
});

// Error handler (must be last)
app.use(
  errorHandler({
    docBaseUrl: 'https://docs.example.com',
    includeStackTrace: process.env.NODE_ENV !== 'production',
  })
);

// Start server
const PORT = process.env.PORT || 3000;

export function startServer(): void {
  app.listen(PORT, () => {
    console.log(`
🚀 API Platform Server Started

Environment: ${process.env.NODE_ENV || 'development'}
Port: ${PORT}
Default API Version: ${versionConfig.defaultVersion}

Available Endpoints:
  GET  /                - Web UI for OpenAPI converter
  GET  /health          - Health check
  GET  /api/agents/info - Agent identification info

Validated User API (with Zod):
  GET    /api/v2/users       - List users (validated query params)
  POST   /api/v2/users       - Create user (validated body, supports ?dry_run=true)
  GET    /api/v2/users/:id   - Get user by ID
  PUT    /api/v2/users/:id   - Update user (validated body, supports ?dry_run=true)
  DELETE /api/v2/users/:id   - Delete user (supports ?dry_run=true)

Converter API:
  POST /api/convert          - Convert OpenAPI to tools
  POST /api/convert/validate - Validate OpenAPI spec
  GET  /api/convert/info     - Converter information

Try it out:
  curl http://localhost:${PORT}/health
  curl -H "X-Agent-ID: my-agent" http://localhost:${PORT}/api/agents/info
  curl http://localhost:${PORT}/api/users?limit=200
    `);
  });
}

// Export app for testing
export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
