import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clearFailedLoginAttempts,
  isLoginAttemptAllowed,
  recordFailedLoginAttempt,
  resetLoginAttemptGuards,
} from './login-attempt-guard.js';

describe('login-attempt-guard', () => {
  const originalMax = process.env.LOGIN_MAX_ATTEMPTS;
  const originalWindow = process.env.LOGIN_ATTEMPT_WINDOW_MS;
  const originalDuration = process.env.LOGIN_LOCKOUT_DURATION_MS;

  beforeEach(async () => {
    process.env.LOGIN_MAX_ATTEMPTS = '2';
    process.env.LOGIN_ATTEMPT_WINDOW_MS = '60000';
    process.env.LOGIN_LOCKOUT_DURATION_MS = '60000';
    await resetLoginAttemptGuards();
  });

  afterEach(async () => {
    await resetLoginAttemptGuards();
    process.env.LOGIN_MAX_ATTEMPTS = originalMax;
    process.env.LOGIN_ATTEMPT_WINDOW_MS = originalWindow;
    process.env.LOGIN_LOCKOUT_DURATION_MS = originalDuration;
  });

  it('allows attempts before threshold', async () => {
    const ip = '127.0.0.1';
    const email = 'user@example.com';

    expect((await isLoginAttemptAllowed(ip, email)).allowed).toBe(true);
    const first = await recordFailedLoginAttempt(ip, email);
    expect(first.locked).toBe(false);
    expect((await isLoginAttemptAllowed(ip, email)).allowed).toBe(true);
  });

  it('locks after threshold and returns retry-after', async () => {
    const ip = '127.0.0.1';
    const email = 'user@example.com';

    await recordFailedLoginAttempt(ip, email);
    const second = await recordFailedLoginAttempt(ip, email);
    expect(second.locked).toBe(true);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);

    const blocked = await isLoginAttemptAllowed(ip, email);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('clears lockout state on successful login clear', async () => {
    const ip = '127.0.0.1';
    const email = 'user@example.com';

    await recordFailedLoginAttempt(ip, email);
    await recordFailedLoginAttempt(ip, email);
    expect((await isLoginAttemptAllowed(ip, email)).allowed).toBe(false);

    await clearFailedLoginAttempts(ip, email);
    expect((await isLoginAttemptAllowed(ip, email)).allowed).toBe(true);
  });
});
