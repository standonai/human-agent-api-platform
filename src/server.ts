/**
 * API Platform Server
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import express from 'express';
import http from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  requestIdMiddleware,
  versioningMiddleware,
  agentTrackingMiddleware,
  errorHandler,
  dryRunMiddleware,
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
} from './middleware/index.js';
import { metricsMiddleware } from './observability/index.js';
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
import { initializeDatabase, checkpointDatabase } from './db/database.js';
import { initializeDefaultUsers } from './auth/user-store.js';
import { initializeDefaultAgents } from './auth/agent-store.js';
import { initializeRedis, logRedisStatus } from './config/redis-config.js';
import { createSecretsProvider, initializeSecretsManager, logSecretsStatus, getSecretsManager } from './secrets/index.js';
import { prometheusMiddleware, enableDefaultMetrics, startSystemMetricsCollection } from './monitoring/index.js';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // Initialize database FIRST (user/agent/task stores depend on it)
  await initializeDatabase();

  // Initialize secrets manager (before anything that needs secrets)
  try {
    const provider = await createSecretsProvider();
    await initializeSecretsManager(provider);
  } catch {
    console.warn('⚠️  Secrets manager initialization failed (using environment variables)');
  }

  // Initialize default users and agents (seeded only if tables are empty)
  await initializeDefaultUsers();
  initializeDefaultAgents();

  // Initialize Redis for distributed rate limiting (optional)
  try {
    await initializeRedis();
  } catch {
    console.warn('⚠️  Redis initialization failed (using in-memory rate limiting)');
  }

  // Initialize gateway connection
  const gatewayManager = getGatewayManager();
  if (gatewayManager.isEnabled()) {
    try {
      await gatewayManager.initialize();
    } catch {
      console.warn('⚠️  Gateway initialization failed (continuing without gateway)');
    }
  }

  const server = http.createServer(app);

  // Graceful shutdown: checkpoint SQLite WAL before exit
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully`);
    await checkpointDatabase();
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`
🚀 API Platform Server Started

Environment: ${process.env.NODE_ENV || 'development'}
Port: ${PORT}
Default API Version: ${versionConfig.defaultVersion}
`);

    // Log configuration status
    logRedisStatus();
    const secretsManager = getSecretsManager();
    logSecretsStatus(secretsManager.getProviderName());
    logSecurityHeaders();
    logCorsConfig();

    console.log(`
📊 Observability:
  GET /api/monitoring/metrics      - Prometheus metrics
  GET /api/monitoring/health/ready - Readiness probe
  GET /api/monitoring/health/live  - Liveness probe

Gateway:
  GET  /api/gateway/status - Gateway connection status
  POST /api/gateway/sync   - Manually sync OpenAPI spec

API:
  GET    /api/v2/users       - List users
  POST   /api/v2/users       - Create user (supports ?dry_run=true)
  GET    /api/v2/tasks       - List tasks
  POST   /api/v2/tasks       - Create task (supports ?dry_run=true)
  POST   /api/convert        - Convert OpenAPI to tool definitions
    `);
  });
}

// Export app for testing
export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
