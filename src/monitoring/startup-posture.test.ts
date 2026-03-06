import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let redisHealthy = false;
let secretsHealthy = true;
let secretsProvider = 'environment';
let gatewayEnabled = false;
let gatewayHealthy = false;

vi.mock('../config/redis-config.js', () => ({
  isRedisHealthy: () => redisHealthy,
}));

vi.mock('../secrets/index.js', () => ({
  getSecretsManager: () => ({
    isHealthy: async () => secretsHealthy,
    getProviderName: () => secretsProvider,
  }),
}));

vi.mock('../gateway/index.js', () => ({
  getGatewayManager: () => ({
    isEnabled: () => gatewayEnabled,
    getHealth: async () => ({ healthy: gatewayHealthy, provider: 'kong' }),
  }),
}));

import { getStartupPostureSummary } from './startup-posture.js';

describe('startup-posture', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    redisHealthy = false;
    secretsHealthy = true;
    secretsProvider = 'environment';
    gatewayEnabled = false;
    gatewayHealthy = false;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('marks dependency fallbacks as fail in strict full production mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_PROFILE = 'full';
    process.env.FULL_PROFILE_STRICT = 'true';
    process.env.DISABLE_REDIS = 'false';

    redisHealthy = false; // fallback mode
    secretsHealthy = true;
    secretsProvider = 'environment'; // fallback provider
    gatewayEnabled = true;
    gatewayHealthy = false;

    const posture = await getStartupPostureSummary();

    expect(posture.strictDependencyReadiness).toBe(true);
    expect(posture.redisMode).toBe('in-memory-fallback');
    expect(posture.dependencies.redis).toBe('fail');
    expect(posture.dependencies.secrets).toBe('fail');
    expect(posture.dependencies.gateway).toBe('fail');
  });

  it('marks fallback dependencies as warn outside strict full production mode', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_PROFILE = 'core';
    process.env.FULL_PROFILE_STRICT = 'false';
    process.env.DISABLE_REDIS = 'true';

    redisHealthy = false;
    secretsHealthy = false;
    secretsProvider = 'environment';
    gatewayEnabled = false;

    const posture = await getStartupPostureSummary();

    expect(posture.strictDependencyReadiness).toBe(false);
    expect(posture.redisMode).toBe('disabled');
    expect(posture.dependencies.redis).toBe('warn');
    expect(posture.dependencies.secrets).toBe('warn');
    expect(posture.dependencies.gateway).toBe('pass');
  });

  it('marks all dependencies pass when distributed/healthy', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_PROFILE = 'full';
    process.env.FULL_PROFILE_STRICT = 'true';
    process.env.DISABLE_REDIS = 'false';

    redisHealthy = true;
    secretsHealthy = true;
    secretsProvider = 'vault';
    gatewayEnabled = true;
    gatewayHealthy = true;

    const posture = await getStartupPostureSummary();

    expect(posture.redisMode).toBe('distributed');
    expect(posture.dependencies.redis).toBe('pass');
    expect(posture.dependencies.secrets).toBe('pass');
    expect(posture.dependencies.gateway).toBe('pass');
  });
});
