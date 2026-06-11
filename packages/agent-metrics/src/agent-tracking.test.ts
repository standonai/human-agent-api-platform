import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { agentTrackingMiddleware, isAgentRequest, getAgentType } from './agent-tracking.js';

describe('agentTrackingMiddleware', () => {
  it('should detect OpenAI agents', () => {
    const req = {
      headers: {
        'user-agent': 'OpenAI-GPT/4.0',
      },
      requestId: 'req_123',
    } as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    agentTrackingMiddleware(req, res, next);

    expect(req.agentContext?.identification.agentType).toBe('openai');
    expect(res.setHeader).toHaveBeenCalledWith('X-Detected-Agent-Type', 'openai');
    expect(next).toHaveBeenCalled();
  });

  it('should detect Anthropic agents', () => {
    const req = {
      headers: {
        'user-agent': 'Claude-Agent/1.0',
      },
      requestId: 'req_123',
    } as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    agentTrackingMiddleware(req, res, next);

    expect(req.agentContext?.identification.agentType).toBe('anthropic');
  });

  it('should detect human requests', () => {
    const req = {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      requestId: 'req_123',
    } as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    agentTrackingMiddleware(req, res, next);

    expect(req.agentContext?.identification.agentType).toBe('human');
    expect(res.setHeader).not.toHaveBeenCalledWith('X-Detected-Agent-Type', expect.anything());
  });

  it('should use explicit agent ID from header', () => {
    const req = {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'x-agent-id': 'custom-agent-123',
      },
      requestId: 'req_123',
    } as unknown as Request;

    const res = {
      setHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    agentTrackingMiddleware(req, res, next);

    expect(req.agentContext?.identification.agentId).toBe('custom-agent-123');
  });
});

describe('isAgentRequest', () => {
  it('should return true for agent requests', () => {
    const req = {
      agentContext: {
        identification: { agentType: 'openai' as const, userAgent: 'OpenAI' },
        requestId: 'req_123',
        timestamp: new Date(),
      },
    } as Request;

    expect(isAgentRequest(req)).toBe(true);
  });

  it('should return false for human requests', () => {
    const req = {
      agentContext: {
        identification: { agentType: 'human' as const, userAgent: 'Mozilla' },
        requestId: 'req_123',
        timestamp: new Date(),
      },
    } as Request;

    expect(isAgentRequest(req)).toBe(false);
  });
});

describe('getAgentType', () => {
  it('should return agent type', () => {
    const req = {
      agentContext: {
        identification: { agentType: 'anthropic' as const, userAgent: 'Claude' },
        requestId: 'req_123',
        timestamp: new Date(),
      },
    } as Request;

    expect(getAgentType(req)).toBe('anthropic');
  });

  it('should return unknown for missing context', () => {
    const req = {} as Request;
    expect(getAgentType(req)).toBe('unknown');
  });
});
