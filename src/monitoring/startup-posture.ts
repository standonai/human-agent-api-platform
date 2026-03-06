import { isRedisHealthy } from '../config/redis-config.js';
import { getGatewayManager } from '../gateway/index.js';
import { getSecretsManager } from '../secrets/index.js';

export interface StartupDependencyStatus {
  redis: 'pass' | 'warn' | 'fail';
  secrets: 'pass' | 'warn' | 'fail';
  gateway: 'pass' | 'warn' | 'fail';
}

export interface StartupPostureSummary {
  environment: string;
  profile: 'core' | 'full';
  strictStartupValidation: boolean;
  strictFullProfileStartup: boolean;
  strictDependencyReadiness: boolean;
  bootstrapSeedingEnabled: boolean;
  docsUrlConfigured: boolean;
  enforceHttps: boolean;
  trustProxy: string;
  securityHeaders: {
    hstsEnabled: boolean;
    hstsMaxAgeSeconds: number;
    cspUpgradeInsecureRequests: boolean;
  };
  redisMode: 'distributed' | 'in-memory-fallback' | 'disabled';
  loginLockout: {
    maxAttempts: number;
    windowMs: number;
    lockoutDurationMs: number;
  };
  refreshToken: {
    maxActiveSessionsPerUser: number;
    cleanupIntervalMs: number;
  };
  dependencies: StartupDependencyStatus;
}

function parseIntOrDefault(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw || `${fallback}`, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export async function getStartupPostureSummary(): Promise<StartupPostureSummary> {
  const env = process.env.NODE_ENV || 'development';
  const rawProfile = (process.env.APP_PROFILE || 'core').toLowerCase();
  const profile: 'core' | 'full' = rawProfile === 'full' ? 'full' : 'core';
  const strictStartupValidation =
    env === 'production' || process.env.STRICT_STARTUP_VALIDATION === 'true';
  const strictFullProfileStartup = profile === 'full' && process.env.FULL_PROFILE_STRICT === 'true';
  const strictDependencyReadiness =
    env === 'production' && profile === 'full' && strictFullProfileStartup;
  const bootstrapSeedingEnabled = process.env.ENABLE_BOOTSTRAP_SEEDING === 'true';
  const docsUrlConfigured = Boolean(process.env.DOCS_BASE_URL);
  const redisDisabled = process.env.DISABLE_REDIS === 'true';
  const enforceHttps = process.env.ENFORCE_HTTPS === 'true';
  const trustProxy = process.env.TRUST_PROXY || 'false';
  const hstsEnabled = ['true', '1', 'yes'].includes(
    (process.env.SECURITY_HSTS_ENABLED || (env === 'production' ? 'true' : 'false')).toLowerCase()
  );
  const cspUpgradeInsecureRequests = ['true', '1', 'yes'].includes(
    (
      process.env.SECURITY_CSP_UPGRADE_INSECURE_REQUESTS ||
      (env === 'production' ? 'true' : 'false')
    ).toLowerCase()
  );
  const hstsMaxAgeSeconds = parseIntOrDefault(process.env.SECURITY_HSTS_MAX_AGE_SECONDS, 31536000);

  const redisMode: StartupPostureSummary['redisMode'] = redisDisabled
    ? 'disabled'
    : isRedisHealthy()
    ? 'distributed'
    : 'in-memory-fallback';

  const loginLockout = {
    maxAttempts: parseIntOrDefault(process.env.LOGIN_MAX_ATTEMPTS, 5),
    windowMs: parseIntOrDefault(process.env.LOGIN_ATTEMPT_WINDOW_MS, 900000),
    lockoutDurationMs: parseIntOrDefault(process.env.LOGIN_LOCKOUT_DURATION_MS, 900000),
  };

  const refreshToken = {
    maxActiveSessionsPerUser: parseIntOrDefault(
      process.env.REFRESH_TOKEN_MAX_ACTIVE_SESSIONS,
      5
    ),
    cleanupIntervalMs: parseIntOrDefault(
      process.env.REFRESH_TOKEN_CLEANUP_INTERVAL_MS,
      3600000
    ),
  };

  const secretsManager = getSecretsManager();
  const secretsHealthy = await secretsManager.isHealthy();
  const secretsProvider = secretsManager.getProviderName();

  const gatewayManager = getGatewayManager();
  const gatewayEnabled = gatewayManager.isEnabled();
  const gatewayHealth = gatewayEnabled ? await gatewayManager.getHealth() : { healthy: true };

  const dependencies: StartupDependencyStatus = {
    redis: redisMode === 'distributed' ? 'pass' : strictDependencyReadiness ? 'fail' : 'warn',
    secrets:
      secretsHealthy && !(strictDependencyReadiness && secretsProvider === 'environment')
        ? 'pass'
        : strictDependencyReadiness
        ? 'fail'
        : 'warn',
    gateway: gatewayEnabled
      ? gatewayHealth.healthy
        ? 'pass'
        : strictDependencyReadiness
        ? 'fail'
        : 'warn'
      : 'pass',
  };

  return {
    environment: env,
    profile,
    strictStartupValidation,
    strictFullProfileStartup,
    strictDependencyReadiness,
    bootstrapSeedingEnabled,
    docsUrlConfigured,
    enforceHttps,
    trustProxy,
    securityHeaders: {
      hstsEnabled,
      hstsMaxAgeSeconds,
      cspUpgradeInsecureRequests,
    },
    redisMode,
    loginLockout,
    refreshToken,
    dependencies,
  };
}
