/**
 * API Platform Server
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import express, { RequestHandler } from 'express';
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
  enforceHttpsIfConfigured,
} from './middleware/index.js';
import converterRoutes from './api/converter-routes.js';
import tasksRoutes from './api/tasks-routes.js';
import authRoutes from './api/auth-routes.js';
import { initializeDatabase, checkpointDatabase } from './db/database.js';
import { initializeDefaultUsers } from './auth/user-store.js';
import {
  startRefreshTokenSessionCleanup,
  stopRefreshTokenSessionCleanup,
} from './auth/refresh-token-store.js';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const rawAppProfile = (process.env.APP_PROFILE || 'core').toLowerCase();
const appProfile = rawAppProfile === 'full' ? 'full' : 'core';
const fullProfileEnabled = appProfile === 'full';
const strictFullProfileStartup =
  fullProfileEnabled && process.env.FULL_PROFILE_STRICT === 'true';
const demoRoutesEnabled = process.env.ENABLE_DEMO_ROUTES === 'true';

function parseTrustProxySetting(raw: string | undefined): boolean | number | string {
  if (!raw || raw.trim() === '') {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    return parseInt(normalized, 10);
  }
  return raw;
}

const trustProxySetting = parseTrustProxySetting(process.env.TRUST_PROXY);
app.set('trust proxy', trustProxySetting);

if (rawAppProfile !== appProfile) {
  console.warn(`⚠️  Unknown APP_PROFILE '${rawAppProfile}', defaulting to 'core'`);
}

function lazyMiddleware(loader: () => Promise<RequestHandler>): RequestHandler {
  let handler: RequestHandler | null = null;
  return async (req, res, next) => {
    try {
      if (!handler) {
        handler = await loader();
      }
      return handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function lazyRoute(
  loader: () => Promise<{ default: RequestHandler }>
): RequestHandler {
  return lazyMiddleware(async () => {
    const mod = await loader();
    return mod.default;
  });
}

// 🔒 Security: Apply security headers FIRST (before any other middleware)
app.use(securityHeaders());
app.use(customSecurityHeaders);

// 🔒 Security: CORS - Restrict which origins can access the API
app.use(corsMiddleware);

// Parse JSON bodies with size limit (prevent memory exhaustion)
app.use(express.json({ limit: '10mb' }));

// Apply core middleware
app.use(requestIdMiddleware);
app.use(enforceHttpsIfConfigured);

// 📊 Monitoring: Collect Prometheus metrics (must be after requestId)
if (fullProfileEnabled) {
  app.use(lazyMiddleware(async () => {
    const { prometheusMiddleware } = await import('./monitoring/index.js');
    return prometheusMiddleware();
  }));
}

// 📝 Audit: Log all requests (must be after requestId)
if (fullProfileEnabled) {
  app.use(lazyMiddleware(async () => {
    const { auditLogMiddleware } = await import('./middleware/audit-log.js');
    return auditLogMiddleware;
  }));
}

// 🔒 Security: Input sanitization and injection detection
app.use(sanitizeInput);           // Sanitize all string inputs (XSS prevention)
app.use(detectInjectionAttacks);  // Detect SQL/NoSQL/command injection attempts

// Configure API versioning
const migrationGuideUrl = process.env.API_MIGRATION_GUIDE_URL;
const versionConfig: VersionConfig = {
  defaultVersion: '2025-01-29',
  supportedVersions: [
    { version: '2025-01-29' },
    { version: '2024-12-01', deprecated: true },
  ],
  deprecatedVersions: migrationGuideUrl
    ? new Map([
        [
          '2024-12-01',
          {
            deprecationDate: new Date('2024-12-01'),
            sunsetDate: new Date('2025-06-01'),
            migrationGuide: migrationGuideUrl,
            replacementVersion: '2025-01-29',
          },
        ],
      ])
    : new Map(),
};

app.use(versioningMiddleware(versionConfig));
app.use(agentTrackingMiddleware);
if (fullProfileEnabled) {
  app.use(lazyMiddleware(async () => {
    const { metricsMiddleware } = await import('./observability/index.js');
    return metricsMiddleware;
  })); // Collect metrics for observability
}

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
app.use('/api', converterRoutes);          // OpenAPI converter
app.use('/api/v2/tasks', tasksRoutes);     // Tasks API
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    profile: appProfile,
  });
});

if (fullProfileEnabled) {
  app.use('/api/agents', lazyRoute(() => import('./api/agents-routes.js'))); // Agent management
  app.use('/api/audit', lazyRoute(() => import('./api/audit-routes.js'))); // Audit logs
  app.use('/api/secrets', lazyRoute(() => import('./api/secrets-routes.js'))); // Secret lifecycle
  app.use('/api/gateway', lazyRoute(() => import('./api/gateway-routes.js'))); // Gateway management
  app.use('/api/monitoring', lazyRoute(() => import('./api/monitoring-routes.js'))); // Metrics & health
  if (demoRoutesEnabled) {
    app.use('/api/v2/users', lazyRoute(() => import('./api/users-routes.js'))); // Demo-only User API
  }
}

// Error handler (must be last)
app.use(
  errorHandler({
    docBaseUrl: process.env.DOCS_BASE_URL,
    includeStackTrace: process.env.NODE_ENV !== 'production',
  })
);

// Start server
const PORT = process.env.PORT || 3000;

interface StartupValidationIssue {
  key: string;
  message: string;
}

class StartupValidationError extends Error {
  constructor(public readonly issues: StartupValidationIssue[]) {
    super(`Startup validation failed with ${issues.length} issue(s).`);
    this.name = 'StartupValidationError';
  }
}

function validateStartupConfig(): void {
  const env = process.env.NODE_ENV || 'development';
  const strictValidation = env === 'production' || process.env.STRICT_STARTUP_VALIDATION === 'true';

  if (!strictValidation) {
    return;
  }
  const issues: StartupValidationIssue[] = [];

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    issues.push({
      key: 'JWT_SECRET',
      message: 'Must be set when strict startup validation is enabled.',
    });
  }

  if (jwtSecret && (jwtSecret.includes('change-me') || jwtSecret.includes('dev-secret'))) {
    issues.push({
      key: 'JWT_SECRET',
      message: 'Must not use development/default placeholder values.',
    });
  }

  if (!process.env.ALLOWED_ORIGINS) {
    issues.push({
      key: 'ALLOWED_ORIGINS',
      message: 'Must be set when strict startup validation is enabled.',
    });
  }

  if (fullProfileEnabled && strictFullProfileStartup) {
    const gatewayProvider = (process.env.GATEWAY_PROVIDER || 'none').toLowerCase();
    if (gatewayProvider !== 'none' && !process.env.GATEWAY_ADMIN_URL && gatewayProvider !== 'aws') {
      issues.push({
        key: 'GATEWAY_ADMIN_URL',
        message: 'Required for non-AWS gateway providers in strict full mode.',
      });
    }
  }

  const requestTimeoutMs = parseInt(process.env.SERVER_REQUEST_TIMEOUT_MS || '30000', 10);
  const headersTimeoutMs = parseInt(process.env.SERVER_HEADERS_TIMEOUT_MS || '35000', 10);
  const keepAliveTimeoutMs = parseInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || '5000', 10);

  if (
    Number.isNaN(requestTimeoutMs) ||
    Number.isNaN(headersTimeoutMs) ||
    Number.isNaN(keepAliveTimeoutMs) ||
    requestTimeoutMs <= 0 ||
    headersTimeoutMs <= 0 ||
    keepAliveTimeoutMs <= 0
  ) {
    issues.push({
      key: 'SERVER_REQUEST_TIMEOUT_MS, SERVER_HEADERS_TIMEOUT_MS, SERVER_KEEP_ALIVE_TIMEOUT_MS',
      message: 'All server timeout settings must be positive integers.',
    });
  }

  if (headersTimeoutMs <= keepAliveTimeoutMs) {
    issues.push({
      key: 'SERVER_HEADERS_TIMEOUT_MS, SERVER_KEEP_ALIVE_TIMEOUT_MS',
      message: 'SERVER_HEADERS_TIMEOUT_MS must be greater than SERVER_KEEP_ALIVE_TIMEOUT_MS.',
    });
  }

  const loginMaxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10);
  const loginAttemptWindowMs = parseInt(process.env.LOGIN_ATTEMPT_WINDOW_MS || '900000', 10);
  const loginLockoutDurationMs = parseInt(process.env.LOGIN_LOCKOUT_DURATION_MS || '900000', 10);
  const enforceHttps = process.env.ENFORCE_HTTPS === 'true';
  const trustProxyRaw = process.env.TRUST_PROXY;
  const securityHstsMaxAge = parseInt(process.env.SECURITY_HSTS_MAX_AGE_SECONDS || '31536000', 10);
  const refreshTokenMaxSessions = parseInt(
    process.env.REFRESH_TOKEN_MAX_ACTIVE_SESSIONS || '5',
    10
  );
  if (
    Number.isNaN(loginMaxAttempts) ||
    Number.isNaN(loginAttemptWindowMs) ||
    Number.isNaN(loginLockoutDurationMs) ||
    loginMaxAttempts <= 0 ||
    loginAttemptWindowMs <= 0 ||
    loginLockoutDurationMs <= 0
  ) {
    issues.push({
      key: 'LOGIN_MAX_ATTEMPTS, LOGIN_ATTEMPT_WINDOW_MS, LOGIN_LOCKOUT_DURATION_MS',
      message: 'Login lockout settings must be positive integers.',
    });
  }

  if (Number.isNaN(refreshTokenMaxSessions) || refreshTokenMaxSessions <= 0) {
    issues.push({
      key: 'REFRESH_TOKEN_MAX_ACTIVE_SESSIONS',
      message: 'Must be a positive integer.',
    });
  }

  if (enforceHttps && (!trustProxyRaw || trustProxyRaw.trim().toLowerCase() === 'false')) {
    issues.push({
      key: 'TRUST_PROXY',
      message: 'Must be configured (for example: true, 1, or loopback) when ENFORCE_HTTPS=true.',
    });
  }

  if (Number.isNaN(securityHstsMaxAge) || securityHstsMaxAge <= 0) {
    issues.push({
      key: 'SECURITY_HSTS_MAX_AGE_SECONDS',
      message: 'Must be a positive integer.',
    });
  }

  if (issues.length > 0) {
    throw new StartupValidationError(issues);
  }
}

function logStartupFailure(error: unknown): void {
  if (error instanceof StartupValidationError) {
    console.error('\n❌ Startup validation failed. Fix the following environment settings:');
    for (const issue of error.issues) {
      console.error(`   - ${issue.key}: ${issue.message}`);
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ Server startup failed: ${message}`);
}

async function logSecurityPostureSummary(): Promise<void> {
  const { getStartupPostureSummary } = await import('./monitoring/startup-posture.js');
  const posture = await getStartupPostureSummary();
  const redisMode =
    posture.redisMode === 'distributed'
      ? 'distributed'
      : posture.redisMode === 'disabled'
      ? 'disabled (in-memory fallbacks)'
      : 'in-memory fallback';

  console.log(`
Security Posture:
  Strict Startup Validation: ${posture.strictStartupValidation ? 'enabled' : 'disabled'}
  Strict Full Profile Startup: ${posture.strictFullProfileStartup ? 'enabled' : 'disabled'}
  Bootstrap Seeding: ${posture.bootstrapSeedingEnabled ? 'enabled' : 'disabled'}
  Redis Security Controls: ${redisMode}
  Login Lockout: ${posture.loginLockout.maxAttempts} attempts / ${Math.floor(posture.loginLockout.windowMs / 1000)}s window, ${Math.floor(posture.loginLockout.lockoutDurationMs / 1000)}s lockout
  Refresh Session Cap: ${posture.refreshToken.maxActiveSessionsPerUser} active sessions/user
  Docs URL Exposure: ${posture.docsUrlConfigured ? 'configured' : 'disabled'}
  HTTPS Enforcement: ${posture.enforceHttps ? 'enabled' : 'disabled'}
  Trust Proxy: ${posture.trustProxy}
  HSTS: ${posture.securityHeaders.hstsEnabled ? `enabled (${posture.securityHeaders.hstsMaxAgeSeconds}s)` : 'disabled'}
  CSP upgrade-insecure-requests: ${posture.securityHeaders.cspUpgradeInsecureRequests ? 'enabled' : 'disabled'}
`);

  if (posture.environment === 'production' && !posture.strictStartupValidation) {
    console.warn('⚠️  Production is running without strict startup validation.');
  }
  if (posture.environment === 'production' && posture.bootstrapSeedingEnabled) {
    console.warn('⚠️  Bootstrap seeding is enabled in production and should be disabled.');
  }
  if (posture.environment === 'production' && posture.redisMode === 'in-memory-fallback') {
    console.warn('⚠️  Redis unavailable in production; distributed protections are in fallback mode.');
  }
}

export async function startServer(): Promise<void> {
  validateStartupConfig();

  // Initialize monitoring metrics collection
  if (fullProfileEnabled) {
    const { enableDefaultMetrics, startSystemMetricsCollection } = await import('./monitoring/index.js');
    enableDefaultMetrics();
    startSystemMetricsCollection();
  }

  // Initialize database FIRST (user/agent/task stores depend on it)
  await initializeDatabase();

  // Initialize default users (seeded only if tables are empty)
  await initializeDefaultUsers();

  const refreshTokenCleanupIntervalMs = parseInt(
    process.env.REFRESH_TOKEN_CLEANUP_INTERVAL_MS || '3600000',
    10
  );
  startRefreshTokenSessionCleanup(refreshTokenCleanupIntervalMs);

  // Initialize Redis for distributed rate limiting and auth lockout (optional)
  try {
    const redisConfig = await import('./config/redis-config.js');
    await redisConfig.initializeRedis();
  } catch (error) {
    if (strictFullProfileStartup) {
      throw error;
    }
    console.warn('⚠️  Redis initialization failed (using in-memory fallbacks)');
  }

  // Full profile dependencies
  if (fullProfileEnabled) {
    const secrets = await import('./secrets/index.js');
    const { initializeDefaultAgents } = await import('./auth/agent-store.js');

    // Initialize secrets manager (before anything that needs secrets)
    try {
      const provider = await secrets.createSecretsProvider();
      await secrets.initializeSecretsManager(provider);
    } catch (error) {
      if (strictFullProfileStartup) {
        throw error;
      }
      console.warn('⚠️  Secrets manager initialization failed (using environment variables)');
    }

    // Initialize default agents (seeded only if table is empty)
    initializeDefaultAgents();

  } else {
    console.log('ℹ️  Core profile: skipping full-profile dependency initialization');
  }

  if (fullProfileEnabled) {
    // Initialize gateway connection
    const { getGatewayManager } = await import('./gateway/index.js');
    const gatewayManager = getGatewayManager();
    if (gatewayManager.isEnabled()) {
      try {
        await gatewayManager.initialize();
      } catch {
        console.warn('⚠️  Gateway initialization failed (continuing without gateway)');
      }
    }
  }

  const server = http.createServer(app);
  const requestTimeoutMs = parseInt(process.env.SERVER_REQUEST_TIMEOUT_MS || '30000', 10);
  const headersTimeoutMs = parseInt(process.env.SERVER_HEADERS_TIMEOUT_MS || '35000', 10);
  const keepAliveTimeoutMs = parseInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || '5000', 10);

  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = headersTimeoutMs;
  server.keepAliveTimeout = keepAliveTimeoutMs;

  // Graceful shutdown: checkpoint SQLite WAL before exit
  let shuttingDown = false;
  let shutdownTimer: NodeJS.Timeout | null = null;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`\n${signal} received — shutting down gracefully`);
    const timeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);
    shutdownTimer = setTimeout(() => {
      console.error(`❌ Graceful shutdown timed out after ${timeoutMs}ms; forcing exit`);
      process.exit(1);
    }, timeoutMs);

    // Stop accepting new connections first
    server.close(async () => {
      try {
        await checkpointDatabase();
        stopRefreshTokenSessionCleanup();

        // Close full-profile resources if present (safe no-ops in core mode)
        const [{ closeRedis }, secrets] = await Promise.all([
          import('./config/redis-config.js'),
          import('./secrets/index.js'),
        ]);

        await closeRedis();

        try {
          const secretsManager = secrets.getSecretsManager();
          await secretsManager.close();
        } catch {
          // Secrets manager may not have been initialized in this profile
        }

        if (shutdownTimer) {
          clearTimeout(shutdownTimer);
        }
        process.exit(0);
      } catch (error) {
        if (shutdownTimer) {
          clearTimeout(shutdownTimer);
        }
        console.error('❌ Error during graceful shutdown:', (error as Error).message);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`
🚀 API Platform Server Started

Environment: ${process.env.NODE_ENV || 'development'}
Port: ${PORT}
Default API Version: ${versionConfig.defaultVersion}
Profile: ${appProfile}
Strict Full Startup: ${strictFullProfileStartup ? 'enabled' : 'disabled'}
Demo Routes: ${demoRoutesEnabled ? 'enabled' : 'disabled'}
Docs URL: ${process.env.DOCS_BASE_URL || 'disabled'}
`);

    // Log configuration status
    if (fullProfileEnabled) {
      void (async () => {
        const redisConfig = await import('./config/redis-config.js');
        const secrets = await import('./secrets/index.js');
        redisConfig.logRedisStatus();
        const secretsManager = secrets.getSecretsManager();
        secrets.logSecretsStatus(secretsManager.getProviderName());
      })();
    } else {
      void (async () => {
        const redisConfig = await import('./config/redis-config.js');
        redisConfig.logRedisStatus();
      })();
      console.log('🔒 Secrets Management: Environment/default (core profile)');
    }
    logSecurityHeaders();
    logCorsConfig();
    void logSecurityPostureSummary();

    if (!fullProfileEnabled) {
      console.log(`
Core API Surface:
  GET    /api/health         - Health check
  POST   /api/auth/register  - Register
  POST   /api/auth/login     - Login
  POST   /api/auth/refresh   - Refresh token
  GET    /api/auth/me        - Current user
  GET    /api/v2/tasks       - List tasks
  POST   /api/v2/tasks       - Create task (supports ?dry_run=true)
  POST   /api/convert        - Convert OpenAPI to tool definitions
      `);
      return;
    }

    console.log(`
📊 Observability:
  GET /api/monitoring/metrics      - Prometheus metrics
  GET /api/monitoring/health/startup - Startup posture (admin)
  GET /api/monitoring/health/ready - Readiness probe
  GET /api/monitoring/health/live  - Liveness probe

Gateway:
  GET  /api/gateway/status - Gateway connection status
  POST /api/gateway/sync   - Manually sync OpenAPI spec

API:
  GET    /api/v2/tasks       - List tasks
  POST   /api/v2/tasks       - Create task (supports ?dry_run=true)
  POST   /api/convert        - Convert OpenAPI to tool definitions
${demoRoutesEnabled
  ? `  GET    /api/v2/users       - List users (demo)
  POST   /api/v2/users       - Create user (demo)`
  : '  Demo routes disabled (set ENABLE_DEMO_ROUTES=true to enable /api/v2/users)'}
    `);
  });
}

// Export app for testing
export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    logStartupFailure(error);
    process.exit(1);
  });
}
