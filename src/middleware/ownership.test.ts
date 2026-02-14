/**
 * Ownership Middleware Tests
 *
 * Verifies: owner access, admin bypass, 403 for non-owners, 404 for missing resources.
 */

import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { requireOwnerOrAdmin } from './ownership.js';

function makeRes() {
  let status = 0;
  let body: any = null;
  const res = {
    status(code: number)   { status = code; return this; },
    json(data: any)        { body = data; return this; },
    get statusCode()       { return status; },
  } as unknown as Response;
  return { res, getStatus: () => status, getBody: () => body };
}

function makeReq(user?: any, agent?: any, params: any = {}): Request {
  return { requestId: 'req_test', user, agent, params } as Request;
}

describe('requireOwnerOrAdmin', () => {
  const next = vi.fn();

  describe('resource not found', () => {
    it('returns 404 when loader returns null', async () => {
      const mw = requireOwnerOrAdmin('task', () => null);
      const { res, getStatus, getBody } = makeRes();
      next.mockClear();

      await mw(makeReq({ id: 'u1', role: 'developer' }), res, next);

      expect(getStatus()).toBe(404);
      expect(getBody().error.code).toContain('NOT_FOUND');
      expect(getBody().error.details[0].suggestion).toBeDefined();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('owner access', () => {
    it('calls next when caller is resource owner', async () => {
      const resource = { id: 't1', ownerId: 'u1' };
      const mw = requireOwnerOrAdmin('task', () => resource);
      const req = makeReq({ id: 'u1', role: 'developer' });
      const { res } = makeRes();
      next.mockClear();

      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(); // called with no args = success
      expect((req as any).resource).toBe(resource);
    });

    it('checks createdBy when ownerId is absent', async () => {
      const resource = { id: 't1', createdBy: 'u2' };
      const mw = requireOwnerOrAdmin('task', () => resource);
      const req = makeReq({ id: 'u2', role: 'developer' });
      const { res } = makeRes();
      next.mockClear();

      await mw(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('admin bypass', () => {
    it('allows admin to access any resource regardless of ownership', async () => {
      const resource = { id: 't1', ownerId: 'someone-else' };
      const mw = requireOwnerOrAdmin('task', () => resource);
      const req = makeReq({ id: 'admin1', role: 'admin' });
      const { res } = makeRes();
      next.mockClear();

      await mw(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('access denied', () => {
    it('returns 403 when caller is not owner and not admin', async () => {
      const resource = { id: 't1', ownerId: 'other-user' };
      const mw = requireOwnerOrAdmin('task', () => resource);
      const { res, getStatus, getBody } = makeRes();
      next.mockClear();

      await mw(makeReq({ id: 'u1', role: 'developer' }), res, next);

      expect(getStatus()).toBe(403);
      expect(getBody().error.code).toContain('FORBIDDEN');
      expect(getBody().error.details[0].suggestion).toBeDefined();
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when agent is not owner and there is no admin role', async () => {
      const resource = { id: 't1', ownerId: 'agent_owner' };
      const mw = requireOwnerOrAdmin('task', () => resource);
      const { res, getStatus } = makeRes();
      next.mockClear();

      await mw(makeReq(undefined, { id: 'other_agent' }), res, next);

      expect(getStatus()).toBe(403);
    });
  });

  describe('agent ownership', () => {
    it('allows agent that owns the resource', async () => {
      const resource = { id: 't1', ownerId: 'agent_42' };
      const mw = requireOwnerOrAdmin('task', () => resource);
      const req = makeReq(undefined, { id: 'agent_42' });
      const { res } = makeRes();
      next.mockClear();

      await mw(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('async resource loader', () => {
    it('works with a promise-returning loader', async () => {
      const resource = { id: 't1', ownerId: 'u3' };
      const mw = requireOwnerOrAdmin('task', () => Promise.resolve(resource));
      const req = makeReq({ id: 'u3', role: 'viewer' });
      const { res } = makeRes();
      next.mockClear();

      await mw(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
