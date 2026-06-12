/**
 * Idempotency keys for mutations.
 *
 * Send `Idempotency-Key: <client-chosen-id>` on a mutation; retries with
 * the same key (and identical credentials + request) replay the stored
 * response instead of re-executing. Replays short-circuit *before* route
 * auth runs, so retried requests never pollute the zero-shot metric.
 *
 * Keys are scoped to the exact credentials presented — replaying a stored
 * response requires the same secret that created it.
 */

import { createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { eq, lt } from 'drizzle-orm';
import { getDb, idempotencyKeysTable } from '../db/database.js';
import { ErrorCode } from '../types/errors.js';

const KEY_TTL_MS = 24 * 60 * 60 * 1000;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function keyHashFor(req: Request, key: string): string {
  const credentials = [
    req.headers.authorization || '',
    (req.headers['x-agent-id'] as string) || '',
    (req.headers['x-agent-key'] as string) || '',
  ].join('|');
  return sha256([credentials, req.method, req.path, key].join('|'));
}

function requestHashFor(req: Request): string {
  return sha256(JSON.stringify({ body: req.body ?? null, query: req.query ?? {} }));
}

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['idempotency-key'] as string | undefined;
  if (!key || !MUTATING.has(req.method)) {
    next();
    return;
  }

  const keyHash = keyHashFor(req, key);
  const requestHash = requestHashFor(req);
  const db = getDb();

  // Opportunistic cleanup of stale keys
  db.delete(idempotencyKeysTable)
    .where(lt(idempotencyKeysTable.createdAt, new Date(Date.now() - KEY_TTL_MS)))
    .run();

  const existing = db
    .select()
    .from(idempotencyKeysTable)
    .where(eq(idempotencyKeysTable.keyHash, keyHash))
    .get();

  if (existing) {
    if (existing.requestHash !== requestHash) {
      res.status(422).json({
        error: {
          code: ErrorCode.INVALID_PARAMETER,
          message: 'Idempotency-Key was already used with a different request',
          target: 'Idempotency-Key',
          request_id: req.requestId || 'unknown',
          details: [{
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'The same key must only be retried with an identical request body and query',
            suggestion: 'Generate a new Idempotency-Key for new requests; reuse a key only to retry the same request',
          }],
        },
      });
      return;
    }

    res.setHeader('Idempotency-Replayed', 'true');
    res.status(existing.statusCode);
    if (existing.responseBody) {
      res.type('application/json').send(existing.responseBody);
    } else {
      res.send();
    }
    return;
  }

  // First time: capture the response for future replays.
  const originalSend = res.send.bind(res);
  res.send = function (body?: unknown): Response {
    try {
      getDb()
        .insert(idempotencyKeysTable)
        .values({
          keyHash,
          requestHash,
          statusCode: res.statusCode,
          responseBody: typeof body === 'string' ? body : body ? JSON.stringify(body) : null,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .run();
    } catch {
      // Never let idempotency bookkeeping break the response.
    }
    return originalSend(body as never);
  } as typeof res.send;

  next();
}
