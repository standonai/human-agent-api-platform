import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { dryRunMiddleware, isDryRun } from './dry-run.js';

describe('dryRunMiddleware', () => {
  it('should detect dry_run=true query parameter', () => {
    const req = {
      query: { dry_run: 'true' },
    } as unknown as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    dryRunMiddleware(req, res, next);

    expect(req.isDryRun).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('X-Dry-Run', 'true');
    expect(next).toHaveBeenCalled();
  });

  it('should detect dry_run=1 query parameter', () => {
    const req = {
      query: { dry_run: '1' },
    } as unknown as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    dryRunMiddleware(req, res, next);

    expect(req.isDryRun).toBe(true);
  });

  it('should set isDryRun to false when parameter not present', () => {
    const req = {
      query: {},
    } as unknown as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    dryRunMiddleware(req, res, next);

    expect(req.isDryRun).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('isDryRun', () => {
  it('should return true when request is in dry-run mode', () => {
    const req = { isDryRun: true } as Request;
    expect(isDryRun(req)).toBe(true);
  });

  it('should return false when request is not in dry-run mode', () => {
    const req = { isDryRun: false } as Request;
    expect(isDryRun(req)).toBe(false);
  });
});
