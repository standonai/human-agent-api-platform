import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import { requireAuth } from './auth.js';
import { requireUserOrAgent } from './agent-auth.js';
import { generateAccessToken } from '../auth/jwt-utils.js';
import { UserRole } from '../types/auth.js';

function createResponse(): Response & { statusCode?: number; body?: any } {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode?: number; body?: any };
}

describe('Auth Contract', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
  });

  it('returns standardized 401 envelope when Authorization header is missing', () => {
    const req = {
      headers: {},
      requestId: 'req_missing_auth',
    } as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.request_id).toBe('req_missing_auth');
    expect(res.body.error.details[0].suggestion).toContain('Bearer <token>');
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates valid Bearer token and attaches req.user', () => {
    const token = generateAccessToken({
      id: 'user_42',
      email: 'agent@example.com',
      name: 'Agent User',
      role: UserRole.DEVELOPER,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      requestId: 'req_valid_auth',
    } as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.id).toBe('user_42');
    expect(req.user?.role).toBe(UserRole.DEVELOPER);
  });

  it('returns standardized 401 envelope when neither user nor agent is authenticated', () => {
    const req = {
      requestId: 'req_no_principal',
    } as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    requireUserOrAgent(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.request_id).toBe('req_no_principal');
    expect(res.body.error.details[0].code).toBe('AUTHENTICATION_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });
});
