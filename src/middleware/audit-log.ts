/**
 * Audit Logging Middleware
 *
 * Automatically logs all API requests with full context
 */

import { Request, Response, NextFunction } from 'express';
import {
  logAuditEvent,
  extractAuditInfo,
  updateStats,
  AuditLogEntry,
  LogSeverity,
  EventCategory,
} from '../observability/audit-logger.js';

/**
 * Main audit logging middleware
 *
 * Logs every request with:
 * - User/Agent identification
 * - Request details
 * - Response status
 * - Duration
 */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Extract initial audit info
  const auditInfo = extractAuditInfo(req);

  // Capture response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId: auditInfo.requestId || 'unknown',
      userId: auditInfo.userId,
      userEmail: auditInfo.userEmail,
      userRole: auditInfo.userRole,
      agentId: auditInfo.agentId,
      agentName: auditInfo.agentName,
      ip: auditInfo.ip || 'unknown',
      method: auditInfo.method || 'UNKNOWN',
      path: auditInfo.path || 'unknown',
      query: auditInfo.query,
      userAgent: auditInfo.userAgent,
      statusCode: res.statusCode,
      duration,
      severity: getSeverityFromStatus(res.statusCode),
      eventCategory: determineEventCategory(req.path, req.method),
    };

    // Log the entry
    logAuditEvent(entry);
    updateStats(entry);

    // Log to console in development (structured format)
    if (process.env.NODE_ENV === 'development') {
      logToConsole(entry);
    }
  });

  next();
}

/**
 * Determine log severity based on HTTP status code
 */
function getSeverityFromStatus(statusCode: number): LogSeverity {
  if (statusCode >= 500) {
    return LogSeverity.ERROR;
  } else if (statusCode >= 400) {
    return LogSeverity.WARNING;
  }
  return LogSeverity.INFO;
}

/**
 * Determine event category based on request path and method
 */
function determineEventCategory(path: string, method: string): EventCategory {
  // Authentication endpoints
  if (path.includes('/auth')) {
    return EventCategory.AUTHENTICATION;
  }

  // Agent management
  if (path.includes('/agents')) {
    return EventCategory.ADMIN;
  }

  // Data modification
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return EventCategory.DATA_ACCESS;
  }

  // Default
  return EventCategory.DATA_ACCESS;
}

/**
 * Format and log to console (development only)
 */
function logToConsole(entry: AuditLogEntry): void {
  const statusColor = getStatusColor(entry.statusCode || 0);
  const icon = getSeverityIcon(entry.severity || LogSeverity.INFO);

  const user = entry.userEmail || entry.agentId || 'anonymous';
  const duration = entry.duration ? `${entry.duration}ms` : '-';

  console.log(
    `${icon} ${statusColor}${entry.statusCode}${'\x1b[0m'} ${entry.method} ${entry.path} - ${user} - ${duration}`
  );
}

/**
 * Get ANSI color for status code
 */
function getStatusColor(status: number): string {
  if (status >= 500) return '\x1b[31m'; // Red
  if (status >= 400) return '\x1b[33m'; // Yellow
  if (status >= 300) return '\x1b[36m'; // Cyan
  if (status >= 200) return '\x1b[32m'; // Green
  return '\x1b[37m'; // White
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: LogSeverity): string {
  switch (severity) {
    case LogSeverity.CRITICAL:
      return '🚨';
    case LogSeverity.ERROR:
      return '❌';
    case LogSeverity.WARNING:
      return '⚠️ ';
    case LogSeverity.INFO:
    default:
      return '✓';
  }
}

/**
 * Sanitize sensitive data from logs
 *
 * Removes passwords, tokens, API keys, etc.
 */
export function sanitizeLogData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = [
    'password',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',
    'refreshToken',
    'accessToken',
  ];

  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();

    // Redact sensitive fields
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '***REDACTED***';
    }
    // Recursively sanitize nested objects
    else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Log body for specific events (sanitized)
 */
export function logRequestBody(req: Request, event: string): void {
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitized = sanitizeLogData(req.body);
    const auditInfo = extractAuditInfo(req);

    logAuditEvent({
      timestamp: new Date().toISOString(),
      requestId: auditInfo.requestId || 'unknown',
      userId: auditInfo.userId,
      userEmail: auditInfo.userEmail,
      userRole: auditInfo.userRole,
      agentId: auditInfo.agentId,
      agentName: auditInfo.agentName,
      ip: auditInfo.ip || 'unknown',
      method: auditInfo.method || 'UNKNOWN',
      path: auditInfo.path || 'unknown',
      event: event as any,
      metadata: { body: sanitized },
      severity: LogSeverity.INFO,
      eventCategory: EventCategory.DATA_ACCESS,
    });
  }
}
