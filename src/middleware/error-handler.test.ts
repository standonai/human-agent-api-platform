/**
 * Error Handler Tests
 *
 * Verifies: error envelope format, no stack leaks in production,
 * correct status codes, actionable suggestions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { errorHandler, ApiError } from './error-handler.js';
import { ErrorCode } from '../types/errors.js';

function makeReq(overrides: Partial<Request> = {}): Request {
  return { requestId: 'req_test', ...overrides } as Request;
}

function makeRes() {
  let status = 0;
  let body: any = null;
  const headers: Record<string, string> = {};
  const res = {
    headersSent: false,
    status(code: number) { status = code; return this; },
    json(data: any)     { body = data; return this; },
    setHeader(k: string, v: string) { headers[k] = v; },
    get statusCode()    { return status; },
  } as unknown as Response;
  return { res, getStatus: () => status, getBody: () => body, headers };
}

describe('errorHandler', () => {
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ApiError handling', () => {
    it('returns correct status code and error envelope', () => {
      const handler = errorHandler();
      const req = makeReq();
      const { res, getStatus, getBody } = makeRes();

      handler(
        new ApiError(400, ErrorCode.INVALID_PARAMETER, 'Bad param', 'field', [
          { code: 'X', message: 'msg', suggestion: 'fix it' },
        ]),
        req, res, next
      );

      expect(getStatus()).toBe(400);
      expect(getBody().error.code).toBe(ErrorCode.INVALID_PARAMETER);
      expect(getBody().error.message).toBe('Bad param');
      expect(getBody().error.request_id).toBe('req_test');
    });

    it('includes actionable suggestion in details', () => {
      const handler = errorHandler();
      const { res, getBody } = makeRes();

      handler(
        new ApiError(400, ErrorCode.INVALID_PARAMETER, 'Bad', undefined, [
          { code: 'ERR', message: 'msg', suggestion: 'Do this to fix it' },
        ]),
        makeReq(), res, next
      );

      expect(getBody().error.details[0].suggestion).toBe('Do this to fix it');
    });

    it('includes doc_url when docBaseUrl is configured', () => {
      const handler = errorHandler({ docBaseUrl: 'https://docs.example.com' });
      const { res, getBody } = makeRes();

      handler(new ApiError(404, ErrorCode.NOT_FOUND, 'Not found'), makeReq(), res, next);

      expect(getBody().error.doc_url).toContain('docs.example.com');
    });

    it('returns 404 for NOT_FOUND errors', () => {
      const handler = errorHandler();
      const { res, getStatus } = makeRes();

      handler(new ApiError(404, ErrorCode.NOT_FOUND, 'Resource not found'), makeReq(), res, next);

      expect(getStatus()).toBe(404);
    });

    it('returns 403 for FORBIDDEN errors', () => {
      const handler = errorHandler();
      const { res, getStatus } = makeRes();

      handler(new ApiError(403, ErrorCode.FORBIDDEN, 'Forbidden'), makeReq(), res, next);

      expect(getStatus()).toBe(403);
    });
  });

  describe('Unexpected errors', () => {
    it('returns 500 for generic errors', () => {
      const handler = errorHandler();
      const { res, getStatus, getBody } = makeRes();

      handler(new Error('Something exploded'), makeReq(), res, next);

      expect(getStatus()).toBe(500);
      expect(getBody()).toBeDefined();
    });

    it('never exposes stack traces in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const handler = errorHandler();
      const { res, getBody } = makeRes();
      const err = new Error('Internal implementation detail');

      handler(err, makeReq(), res, next);

      const body = JSON.stringify(getBody());
      expect(body).not.toContain('at Object.');    // no stack frames
      expect(body).not.toContain('node_modules');   // no file paths
      expect(body).not.toContain('Internal implementation detail'); // no internal message

      process.env.NODE_ENV = originalEnv;
    });

    it('always includes request_id for correlation', () => {
      const handler = errorHandler();
      const { res, getBody } = makeRes();

      handler(new Error('oops'), makeReq({ requestId: 'corr_123' }), res, next);

      expect(getBody().error.request_id).toBe('corr_123');
    });
  });

  describe('Validation errors', () => {
    it('returns 400 for ZodError', () => {
      const handler = errorHandler();
      const { res, getStatus } = makeRes();
      const zodErr = Object.assign(new Error('validation failed'), { name: 'ZodError' });

      handler(zodErr, makeReq(), res, next);

      expect(getStatus()).toBe(400);
    });
  });

  describe('Rate limit errors', () => {
    it('returns 429 for TooManyRequestsError', () => {
      const handler = errorHandler();
      const { res, getStatus } = makeRes();
      const err = Object.assign(new Error('too many'), { name: 'TooManyRequestsError' });

      handler(err, makeReq(), res, next);

      expect(getStatus()).toBe(429);
    });
  });
});
