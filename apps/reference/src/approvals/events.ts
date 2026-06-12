/**
 * In-process approval resolution events, powering the SSE stream at
 * GET /api/approvals/{id}/events so agents learn outcomes without polling.
 * Single-node by design (SQLite runtime); swap for Redis pub/sub if the
 * app ever scales horizontally.
 */

import { EventEmitter } from 'events';
import { PendingChange } from './approval-store.js';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export interface ApprovalEvent {
  approval_id: string;
  status: PendingChange['status'];
  result_status?: number;
  reject_reason?: string;
}

export function emitApprovalResolved(change: PendingChange): void {
  const event: ApprovalEvent = {
    approval_id: change.id,
    status: change.status,
    result_status: change.resultStatus,
    reject_reason: change.rejectReason,
  };
  emitter.emit(change.id, event);
}

export function onApprovalResolved(
  approvalId: string,
  listener: (event: ApprovalEvent) => void
): () => void {
  emitter.on(approvalId, listener);
  return () => emitter.off(approvalId, listener);
}
