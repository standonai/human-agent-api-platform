import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { requestIdMiddleware, generateRequestId } from './request-id.js';

describe('generateRequestId', () => {
  it('should generate a unique request ID with req_ prefix', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^req_[a-z0-9]+_[a-f0-9]{16}$/);
  });

  it('should generate different IDs on consecutive calls', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).not.toBe(id2);
  });
});

describe('requestIdMiddleware', () => {
  it('should generate and attach request ID', () => {
    const req = {
      headers: {},
    } as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^req_/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should use existing request ID from header', () => {
    const existingId = 'req_custom_123';
    const req = {
      headers: {
        'x-request-id': existingId,
      },
    } as unknown as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe(existingId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', existingId);
  });
});
