/**
 * Reference API Server
 * Demonstrates all middleware and platform standards
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import express, { Request, Response } from 'express';
import http from 'http';
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
  corsMiddleware,
  logCorsConfig,
  securityHeaders,
  customSecurityHeaders,
  logSecurityHeaders,
  sanitizeInput,
  detectInjectionAttacks,
  auditLogMiddleware,
  httpsRedirect,
} from './middleware/index.js';
import { metricsMiddleware } from './observability/index.js';
import { ErrorCode } from './types/errors.js';
import converterRoutes from './api/converter-routes.js';
import usersRoutes from './api/users-routes.js';
import tasksRoutes from './api/tasks-routes.js';
import metricsRoutes from './api/metrics-routes.js';
import gatewayRoutes from './api/gateway-routes.js';
import authRoutes from './api/auth-routes.js';
import agentsRoutes from './api/agents-routes.js';
import auditRoutes from './api/audit-routes.js';
import monitoringRoutes from './api/monitoring-routes.js';
import secretsRoutes from './api/secrets-routes.js';
import { getGatewayManager } from './gateway/index.js';
import { initializeDefaultUsers } from './auth/user-store.js';
import { initializeDefaultAgents } from './auth/agent-store.js';
import { createHTTPSServer, isTLSEnabled, logTLSStatus } from './config/tls-config.js';
import { initializeRedis, logRedisStatus } from './config/redis-config.js';
import { createSecretsProvider, initializeSecretsManager, logSecretsStatus, getSecretsManager } from './secrets/index.js';
import { prometheusMiddleware, enableDefaultMetrics, startSystemMetricsCollection } from './monitoring/index.js';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

// 🔒 Security: HTTPS redirect (production only)
app.use(httpsRedirect);

// 🔒 Security: Apply security headers FIRST (before any other middleware)
app.use(securityHeaders);
app.use(customSecurityHeaders);

// 🔒 Security: CORS - Restrict which origins can access the API
app.use(corsMiddleware);

// Parse JSON bodies with size limit (prevent memory exhaustion)
app.use(express.json({ limit: '10mb' }));

// Apply core middleware
app.use(requestIdMiddleware);

// 📊 Monitoring: Collect Prometheus metrics (must be after requestId)
app.use(prometheusMiddleware());

// 📝 Audit: Log all requests (must be after requestId)
app.use(auditLogMiddleware);

// 🔒 Security: Input sanitization and injection detection
app.use(sanitizeInput);           // Sanitize all string inputs (XSS prevention)
app.use(detectInjectionAttacks);  // Detect SQL/NoSQL/command injection attempts

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
app.use(metricsMiddleware); // Collect metrics for observability

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
app.use('/api/auth', authRoutes);          // Authentication routes (public)
app.use('/api/agents', agentsRoutes);      // Agent management (admin only)
app.use('/api/audit', auditRoutes);        // Audit logs (admin only)
app.use('/api/secrets', secretsRoutes);    // Secret lifecycle management (admin only)
app.use('/api/gateway', gatewayRoutes);    // Gateway management
app.use('/api/metrics', metricsRoutes);    // Legacy metrics
app.use('/api/monitoring', monitoringRoutes); // Prometheus metrics & health
app.use('/api', converterRoutes);          // OpenAPI converter
app.use('/api/v2/users', usersRoutes);     // User API
app.use('/api/v2/tasks', tasksRoutes);     // Tasks API

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

export async function startServer(): Promise<void> {
  // Initialize monitoring metrics collection
  enableDefaultMetrics();
  startSystemMetricsCollection();

  // Initialize secrets manager FIRST (before anything that needs secrets)
  try {
    const provider = await createSecretsProvider();
    await initializeSecretsManager(provider);
  } catch (error) {
    console.warn('⚠️  Secrets manager initialization failed (using environment variables)');
  }

  // Initialize default users and agents (for testing)
  await initializeDefaultUsers();
  initializeDefaultAgents();

  // Initialize Redis for distributed rate limiting (optional)
  try {
    await initializeRedis();
  } catch (error) {
    console.warn('⚠️  Redis initialization failed (using in-memory rate limiting)');
  }

  // Initialize gateway connection
  const gatewayManager = getGatewayManager();
  if (gatewayManager.isEnabled()) {
    try {
      await gatewayManager.initialize();
    } catch (error) {
      console.warn('⚠️  Gateway initialization failed (continuing without gateway)');
    }
  }

  // Determine if TLS is enabled
  const tlsEnabled = isTLSEnabled();
  const protocol = tlsEnabled ? 'https' : 'http';
  const httpsPort = process.env.HTTPS_PORT || 443;

  // Create appropriate server
  let server: http.Server;

  if (tlsEnabled) {
    // HTTPS server
    server = createHTTPSServer(app);

    // In production, also create HTTP server for redirect
    if (process.env.NODE_ENV === 'production') {
      const httpApp = express();
      httpApp.use(httpsRedirect);
      http.createServer(httpApp).listen(PORT, () => {
        console.log(`🔄 HTTP redirect server listening on port ${PORT}`);
        console.log(`   All traffic redirected to https://`);
      });
    }
  } else {
    // HTTP server (development)
    server = http.createServer(app);
  }

  // Start the server
  const listenPort = tlsEnabled && process.env.NODE_ENV === 'production' ? httpsPort : PORT;

  server.listen(listenPort, () => {
    console.log(`
🚀 API Platform Server Started

Environment: ${process.env.NODE_ENV || 'development'}
Port: ${listenPort}
Protocol: ${protocol.toUpperCase()}
Default API Version: ${versionConfig.defaultVersion}
`);

    // Log TLS status
    console.log('');
    logTLSStatus();

    // Log Redis status
    console.log('');
    logRedisStatus();

    // Log secrets management status
    console.log('');
    const secretsManager = getSecretsManager();
    logSecretsStatus(secretsManager.getProviderName());

    // Log security configuration
    console.log('');
    logSecurityHeaders();
    console.log('');
    logCorsConfig();

    console.log(`

📊 Observability Dashboard:
  🌐 ${protocol}://localhost:${listenPort}/dashboard.html

Available Endpoints:
  GET  /                - Web UI for OpenAPI converter
  GET  /health          - Health check
  GET  /api/agents/info - Agent identification info

Observability:
  GET  /api/metrics        - Get aggregated metrics (legacy)
  GET  /api/metrics/health - Metrics system health (legacy)

Monitoring (Prometheus):
  GET  /api/monitoring/metrics      - Prometheus metrics
  GET  /api/monitoring/health       - Comprehensive health check
  GET  /api/monitoring/health/ready - Readiness probe (Kubernetes)
  GET  /api/monitoring/health/live  - Liveness probe (Kubernetes)

Gateway Management:
  GET  /api/gateway/status - Gateway connection status
  POST /api/gateway/sync   - Manually sync OpenAPI spec

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
  curl ${protocol}://localhost:${listenPort}/health
  curl ${protocol}://localhost:${listenPort}/api/metrics
  curl -H "X-Agent-ID: my-agent" ${protocol}://localhost:${listenPort}/api/agents/info
    `);
  });
}

// Export app for testing
export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
