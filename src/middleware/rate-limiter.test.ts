/**
 * Rate Limiter Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { rateLimit, resetRateLimits } from './rate-limiter.js';
import { ApiError } from './error-handler.js';

// Mock request helper
function createRequest(overrides?: Partial<Request>): Request {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    agentContext: {
      identification: { agentType: 'human', userAgent: 'test' },
      requestId: 'test-req',
      timestamp: new Date(),
    },
    ...overrides,
  } as Request;
}

// Mock response helper
function createResponse(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as Response;
  return { res, headers };
}

describe('rateLimit', () => {
  let next: NextFunction;

  beforeEach(() => {
    resetRateLimits();
    next = () => {};
  });

  afterEach(() => {
    resetRateLimits();
  });

  it('should allow requests within limit', () => {
    const middleware = rateLimit();
    const req = createRequest();
    const { res, headers } = createResponse();

    middleware(req, res, next);

    expect(headers['X-RateLimit-Limit']).toBe('100');
    expect(headers['X-RateLimit-Remaining']).toBe('99');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('should block requests when limit exceeded', async () => {
    const middleware = rateLimit({ humanLimit: 2 });
    const req = createRequest();
    const { res } = createResponse();

    // First two requests succeed
    await middleware(req, res, next);
    await middleware(req, res, next);

    // Third request should be blocked
    await expect(middleware(req, res, next)).rejects.toThrow(ApiError);
  });

  it('should use different limits for agents', () => {
    const middleware = rateLimit({ humanLimit: 10, agentLimit: 50 });

    // Human request
    const humanReq = createRequest();
    const { res: humanRes, headers: humanHeaders } = createResponse();
    middleware(humanReq, humanRes, next);
    expect(humanHeaders['X-RateLimit-Limit']).toBe('10');

    // Agent request (different IP)
    const agentReq = createRequest({
      ip: '192.168.1.1',
      agentContext: {
        identification: { agentType: 'openai', userAgent: 'OpenAI-Agent' },
        requestId: 'req-2',
        timestamp: new Date(),
      },
    });
    const { res: agentRes, headers: agentHeaders } = createResponse();
    middleware(agentReq, agentRes, next);
    expect(agentHeaders['X-RateLimit-Limit']).toBe('50');
  });

  it('should use custom limits for specific agents', () => {
    const customLimits = new Map([['premium-agent', 1000]]);
    const middleware = rateLimit({ customLimits });

    const req = createRequest({
      agentContext: {
        identification: {
          agentType: 'openai',
          agentId: 'premium-agent',
          userAgent: 'test',
        },
        requestId: 'req-1',
        timestamp: new Date(),
      },
    });

    const { res, headers } = createResponse();
    middleware(req, res, next);

    expect(headers['X-RateLimit-Limit']).toBe('1000');
  });

  it('should set Retry-After header when rate limited', async () => {
    const middleware = rateLimit({ humanLimit: 1 });
    const req = createRequest();
    const { res, headers } = createResponse();

    await middleware(req, res, next);
    await middleware(req, res, next).catch(() => {});

    expect(headers['Retry-After']).toBeDefined();
    expect(parseInt(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('should include actionable error details', async () => {
    const middleware = rateLimit({ humanLimit: 1 });
    const req = createRequest();
    const { res } = createResponse();

    await middleware(req, res, next);

    const error = await middleware(req, res, next).catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.statusCode).toBe(429);
    expect(apiError.details).toBeDefined();
    expect(apiError.details![0].suggestion).toContain('exponential backoff');
  });

  it('should reset window after expiry', async () => {
    const middleware = rateLimit({ humanLimit: 2, windowMs: 100 });
    const req = createRequest();
    const { res } = createResponse();

    // Use up the limit
    await middleware(req, res, next);
    await middleware(req, res, next);

    // Should be blocked
    await expect(middleware(req, res, next)).rejects.toThrow();

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should work again
    await expect(middleware(req, res, next)).resolves.toBeUndefined();
  });

  it('should track different IPs independently', async () => {
    const middleware = rateLimit({ humanLimit: 1 });

    const req1 = createRequest({ ip: '1.1.1.1' });
    const req2 = createRequest({ ip: '2.2.2.2' });
    const { res } = createResponse();

    // First IP uses its limit
    await middleware(req1, res, next);
    await expect(middleware(req1, res, next)).rejects.toThrow();

    // Second IP should still work
    await expect(middleware(req2, res, next)).resolves.toBeUndefined();
  });

  it('should work with zero config', () => {
    const middleware = rateLimit(); // No config
    const req = createRequest();
    const { res } = createResponse();

    expect(() => middleware(req, res, next)).not.toThrow();
  });

  it('should decrement remaining count correctly', () => {
    const middleware = rateLimit({ humanLimit: 5 });
    const req = createRequest();

    for (let i = 0; i < 5; i++) {
      const { res, headers } = createResponse();
      middleware(req, res, next);
      expect(headers['X-RateLimit-Remaining']).toBe((4 - i).toString());
    }
  });
});
