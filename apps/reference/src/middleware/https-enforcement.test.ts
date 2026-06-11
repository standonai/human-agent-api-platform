import { afterEach, describe, expect, it, vi } from 'vitest';
import { enforceHttpsIfConfigured } from './https-enforcement.js';

describe('enforceHttpsIfConfigured', () => {
  afterEach(() => {
    delete process.env.ENFORCE_HTTPS;
  });

  it('passes through when HTTPS enforcement is disabled', () => {
    const next = vi.fn();
    const req = { secure: false, headers: {}, method: 'GET', originalUrl: '/api/health' } as any;
    const res = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    enforceHttpsIfConfigured(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects insecure GET requests to HTTPS when enabled', () => {
    process.env.ENFORCE_HTTPS = 'true';
    const next = vi.fn();
    const req = {
      secure: false,
      headers: { host: 'api.example.com', 'x-forwarded-proto': 'http' },
      method: 'GET',
      originalUrl: '/api/v2/tasks?limit=10',
    } as any;
    const res = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    enforceHttpsIfConfigured(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith(
      308,
      'https://api.example.com/api/v2/tasks?limit=10'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for insecure non-GET requests when enabled', () => {
    process.env.ENFORCE_HTTPS = 'true';
    const next = vi.fn();
    const req = {
      secure: false,
      headers: { host: 'api.example.com', 'x-forwarded-proto': 'http' },
      method: 'POST',
      originalUrl: '/api/auth/login',
    } as any;
    const res = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    enforceHttpsIfConfigured(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
