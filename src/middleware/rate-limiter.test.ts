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

  it('should block requests when limit exceeded', () => {
    const middleware = rateLimit({ humanLimit: 2 });
    const req = createRequest();
    const { res } = createResponse();

    // First two requests succeed
    middleware(req, res, next);
    middleware(req, res, next);

    // Third request should be blocked
    expect(() => middleware(req, res, next)).toThrow(ApiError);
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

  it('should set Retry-After header when rate limited', () => {
    const middleware = rateLimit({ humanLimit: 1 });
    const req = createRequest();
    const { res, headers } = createResponse();

    middleware(req, res, next);

    try {
      middleware(req, res, next);
    } catch (error) {
      expect(headers['Retry-After']).toBeDefined();
      expect(parseInt(headers['Retry-After'])).toBeGreaterThan(0);
    }
  });

  it('should include actionable error details', () => {
    const middleware = rateLimit({ humanLimit: 1 });
    const req = createRequest();
    const { res } = createResponse();

    middleware(req, res, next);

    try {
      middleware(req, res, next);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.statusCode).toBe(429);
      expect(apiError.details).toBeDefined();
      expect(apiError.details![0].suggestion).toContain('exponential backoff');
    }
  });

  it('should reset window after expiry', async () => {
    const middleware = rateLimit({ humanLimit: 2, windowMs: 100 });
    const req = createRequest();
    const { res } = createResponse();

    // Use up the limit
    middleware(req, res, next);
    middleware(req, res, next);

    // Should be blocked
    expect(() => middleware(req, res, next)).toThrow();

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should work again
    expect(() => middleware(req, res, next)).not.toThrow();
  });

  it('should track different IPs independently', () => {
    const middleware = rateLimit({ humanLimit: 1 });

    const req1 = createRequest({ ip: '1.1.1.1' });
    const req2 = createRequest({ ip: '2.2.2.2' });
    const { res } = createResponse();

    // First IP uses its limit
    middleware(req1, res, next);
    expect(() => middleware(req1, res, next)).toThrow();

    // Second IP should still work
    expect(() => middleware(req2, res, next)).not.toThrow();
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
