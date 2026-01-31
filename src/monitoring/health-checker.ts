/**
 * Comprehensive Health Checker
 *
 * Aggregates health status from all system components:
 * - Application status
 * - Database connectivity
 * - External services (Redis, Secrets Manager, Gateway)
 * - System resources
 */

import { checkRedisHealth } from '../config/redis-config.js';
import { getSecretsManager } from '../secrets/index.js';
import { getGatewayManager } from '../gateway/index.js';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  timestamp: string;
  duration?: number;
  details?: Record<string, any>;
}

const startTime = Date.now();

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: { [key: string]: ComponentHealth } = {};

  // Application health
  checks.application = await checkApplication();

  // Redis health
  checks.redis = await checkRedis();

  // Secrets manager health
  checks.secrets = await checkSecrets();

  // Gateway health
  checks.gateway = await checkGateway();

  // System resources
  checks.system = await checkSystemResources();

  // Memory health
  checks.memory = await checkMemory();

  // Event loop health
  checks.eventLoop = await checkEventLoop();

  // Determine overall status
  const overallStatus = determineOverallStatus(checks);

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '0.1.0',
    checks,
  };
}

/**
 * Check application status
 */
async function checkApplication(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    // Basic application checks
    const nodeVersion = process.version;
    const platform = process.platform;

    return {
      status: 'pass',
      message: 'Application is running',
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      details: {
        nodeVersion,
        platform,
        pid: process.pid,
      },
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Application check failed: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check Redis health
 */
async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const health = await checkRedisHealth();

    if (health.healthy) {
      return {
        status: 'pass',
        message: 'Redis is healthy',
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        details: {
          latency: health.latency,
        },
      };
    } else {
      return {
        status: 'warn',
        message: 'Redis is unavailable (using in-memory fallback)',
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        details: {
          error: health.error,
        },
      };
    }
  } catch (error) {
    return {
      status: 'warn',
      message: 'Redis check failed (using in-memory fallback)',
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check secrets manager health
 */
async function checkSecrets(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const secretsManager = getSecretsManager();
    const healthy = await secretsManager.isHealthy();
    const provider = secretsManager.getProviderName();

    if (healthy) {
      return {
        status: 'pass',
        message: `Secrets manager is healthy (${provider})`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        details: {
          provider,
        },
      };
    } else {
      return {
        status: 'warn',
        message: `Secrets manager degraded (${provider})`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        details: {
          provider,
        },
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: `Secrets manager check failed: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check gateway health
 */
async function checkGateway(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const gatewayManager = getGatewayManager();

    if (!gatewayManager.isEnabled()) {
      return {
        status: 'pass',
        message: 'Gateway is disabled (not required)',
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        details: {
          enabled: false,
        },
      };
    }

    // Gateway is enabled
    return {
      status: 'pass',
      message: 'Gateway is enabled',
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      details: {
        enabled: true,
      },
    };
  } catch (error) {
    return {
      status: 'warn',
      message: 'Gateway check failed (optional)',
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check system resources
 */
async function checkSystemResources(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    return {
      status: 'pass',
      message: 'System resources are healthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      details: {
        uptime: Math.floor(uptime),
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
      },
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `System resource check failed: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check memory usage
 */
async function checkMemory(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const memoryUsage = process.memoryUsage();
    const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Memory usage is healthy';

    if (heapUsedPercent > 90) {
      status = 'fail';
      message = 'Memory usage is critical';
    } else if (heapUsedPercent > 80) {
      status = 'warn';
      message = 'Memory usage is high';
    }

    return {
      status,
      message,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      details: {
        heapUsed: Math.floor(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.floor(memoryUsage.heapTotal / 1024 / 1024),
        heapUsedPercent: Math.floor(heapUsedPercent),
        rss: Math.floor(memoryUsage.rss / 1024 / 1024),
        external: Math.floor(memoryUsage.external / 1024 / 1024),
      },
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Memory check failed: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check event loop health
 */
async function checkEventLoop(): Promise<ComponentHealth> {
  const start = Date.now();

  return new Promise((resolve) => {
    setImmediate(() => {
      const lag = Date.now() - start;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Event loop is healthy';

      if (lag > 1000) {
        status = 'fail';
        message = 'Event loop lag is critical';
      } else if (lag > 100) {
        status = 'warn';
        message = 'Event loop lag is elevated';
      }

      resolve({
        status,
        message,
        timestamp: new Date().toISOString(),
        duration: lag,
        details: {
          lagMs: lag,
        },
      });
    });
  });
}

/**
 * Determine overall status based on component checks
 */
function determineOverallStatus(
  checks: { [key: string]: ComponentHealth }
): 'healthy' | 'degraded' | 'unhealthy' {
  const statuses = Object.values(checks).map((check) => check.status);

  // If any critical component fails, system is unhealthy
  if (statuses.includes('fail')) {
    const failedChecks = Object.entries(checks)
      .filter(([_, check]) => check.status === 'fail')
      .map(([name]) => name);

    // Critical components that must pass
    const criticalComponents = ['application', 'memory', 'eventLoop'];

    const criticalFailure = failedChecks.some((name) =>
      criticalComponents.includes(name)
    );

    if (criticalFailure) {
      return 'unhealthy';
    }

    // Non-critical failure is degraded
    return 'degraded';
  }

  // If any component warns, system is degraded
  if (statuses.includes('warn')) {
    return 'degraded';
  }

  // All components pass
  return 'healthy';
}

/**
 * Simple readiness check (for Kubernetes readiness probe)
 */
export async function isReady(): Promise<boolean> {
  try {
    // Check critical components only
    const appCheck = await checkApplication();
    const memoryCheck = await checkMemory();

    return appCheck.status === 'pass' && memoryCheck.status !== 'fail';
  } catch (error) {
    return false;
  }
}

/**
 * Simple liveness check (for Kubernetes liveness probe)
 */
export async function isAlive(): Promise<boolean> {
  try {
    // Very basic check - is the process responsive?
    return true;
  } catch (error) {
    return false;
  }
}
