/**
 * Audit Logging System
 *
 * Provides comprehensive audit logging for:
 * - All API requests
 * - Authentication events
 * - Security events
 * - Admin actions
 *
 * Compliance: GDPR Article 30, SOC2, HIPAA
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request } from 'express';

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  // Timestamp
  timestamp: string;

  // Request identification
  requestId: string;

  // User/Agent identification
  userId?: string;
  userEmail?: string;
  userRole?: string;
  agentId?: string;
  agentName?: string;

  // Request details
  ip: string;
  method: string;
  path: string;
  query?: any;

  // Response details
  statusCode?: number;
  duration?: number;

  // Event details
  event?: AuditEvent;
  eventCategory?: EventCategory;
  severity?: LogSeverity;

  // Additional context
  userAgent?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Audit event types
 */
export enum AuditEvent {
  // Authentication
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGIN_FAILED = 'USER_LOGIN_FAILED',
  USER_LOGOUT = 'USER_LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REUSE_DETECTED = 'TOKEN_REUSE_DETECTED',

  // User management
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_REGISTERED = 'USER_REGISTERED',

  // Agent management
  AGENT_REGISTERED = 'AGENT_REGISTERED',
  AGENT_DEACTIVATED = 'AGENT_DEACTIVATED',
  AGENT_REACTIVATED = 'AGENT_REACTIVATED',
  AGENT_DELETED = 'AGENT_DELETED',
  AGENT_AUTH_FAILED = 'AGENT_AUTH_FAILED',

  // Authorization
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  FORBIDDEN_ACCESS = 'FORBIDDEN_ACCESS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // Security
  INJECTION_ATTEMPT = 'INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  COMMAND_INJECTION_ATTEMPT = 'COMMAND_INJECTION_ATTEMPT',
  PATH_TRAVERSAL_ATTEMPT = 'PATH_TRAVERSAL_ATTEMPT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Data access
  DATA_ACCESSED = 'DATA_ACCESSED',
  DATA_CREATED = 'DATA_CREATED',
  DATA_UPDATED = 'DATA_UPDATED',
  DATA_DELETED = 'DATA_DELETED',

  // System
  SERVER_STARTED = 'SERVER_STARTED',
  SERVER_STOPPED = 'SERVER_STOPPED',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
}

/**
 * Event categories for filtering
 */
export enum EventCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  DATA_ACCESS = 'DATA_ACCESS',
  SECURITY = 'SECURITY',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

/**
 * Log severity levels
 */
export enum LogSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

/**
 * Winston logger configuration
 */
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-platform' },
  transports: [
    // Console output (development)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),

    // Daily rotating file for all logs
    new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: winston.format.json(),
    }),

    // Separate file for security events
    new DailyRotateFile({
      filename: 'logs/security-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d', // Keep security logs longer
      level: 'warn',
      format: winston.format.json(),
    }),
  ],
});

/**
 * Log an audit event
 */
export function logAuditEvent(entry: AuditLogEntry): void {
  const level = getSeverityLevel(entry.severity || LogSeverity.INFO);

  auditLogger.log(level, 'Audit Event', entry);

  // Alert on critical security events
  if (entry.severity === LogSeverity.CRITICAL) {
    alertSecurityTeam(entry);
  }
}

/**
 * Log a security event
 */
export function logSecurityEvent(
  event: AuditEvent,
  details: {
    ip: string;
    userId?: string;
    agentId?: string;
    path?: string;
    description?: string;
    metadata?: Record<string, any>;
  }
): void {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    requestId: generateRequestId(),
    event,
    eventCategory: EventCategory.SECURITY,
    severity: getEventSeverity(event),
    ip: details.ip,
    userId: details.userId,
    agentId: details.agentId,
    method: 'SECURITY_EVENT',
    path: details.path || 'N/A',
    error: details.description,
    metadata: details.metadata,
  };

  logAuditEvent(entry);
}

/**
 * Extract audit information from request
 */
export function extractAuditInfo(req: Request): Partial<AuditLogEntry> {
  return {
    requestId: req.requestId || 'unknown',
    userId: (req as any).user?.id,
    userEmail: (req as any).user?.email,
    userRole: (req as any).user?.role,
    agentId: (req as any).agent?.id,
    agentName: (req as any).agent?.name,
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    userAgent: req.headers['user-agent'],
  };
}

/**
 * Get Winston log level from severity
 */
function getSeverityLevel(severity: LogSeverity): string {
  switch (severity) {
    case LogSeverity.INFO:
      return 'info';
    case LogSeverity.WARNING:
      return 'warn';
    case LogSeverity.ERROR:
    case LogSeverity.CRITICAL:
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Determine severity based on event type
 */
function getEventSeverity(event: AuditEvent): LogSeverity {
  const criticalEvents = [
    AuditEvent.SQL_INJECTION_ATTEMPT,
    AuditEvent.COMMAND_INJECTION_ATTEMPT,
    AuditEvent.AGENT_DELETED,
    AuditEvent.USER_DELETED,
    AuditEvent.TOKEN_REUSE_DETECTED,
  ];

  const warningEvents = [
    AuditEvent.USER_LOGIN_FAILED,
    AuditEvent.AGENT_AUTH_FAILED,
    AuditEvent.UNAUTHORIZED_ACCESS,
    AuditEvent.FORBIDDEN_ACCESS,
    AuditEvent.INJECTION_ATTEMPT,
    AuditEvent.XSS_ATTEMPT,
    AuditEvent.PATH_TRAVERSAL_ATTEMPT,
    AuditEvent.RATE_LIMIT_EXCEEDED,
  ];

  if (criticalEvents.includes(event)) {
    return LogSeverity.CRITICAL;
  } else if (warningEvents.includes(event)) {
    return LogSeverity.WARNING;
  }

  return LogSeverity.INFO;
}

/**
 * Deduplication: track last alert sent time per alert name
 */
const lastAlertSentAt = new Map<string, number>();
const ALERT_DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Send a JSON payload to a URL. Fires and forgets; never throws.
 */
async function sendAlertToChannel(url: string, payload: Record<string, any>): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`Alert delivery failed (${response.status}) to ${url}`);
    }
  } catch (err) {
    console.error(`Alert delivery error to ${url}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Alert security team on critical events
 */
function alertSecurityTeam(entry: AuditLogEntry): void {
  console.error('CRITICAL SECURITY EVENT:', {
    event: entry.event,
    ip: entry.ip,
    userId: entry.userId,
    path: entry.path,
    timestamp: entry.timestamp,
  });

  const alertKey = entry.event || 'unknown';
  const now = Date.now();
  const lastSent = lastAlertSentAt.get(alertKey);
  if (lastSent && now - lastSent < ALERT_DEDUP_WINDOW_MS) {
    return;
  }
  lastAlertSentAt.set(alertKey, now);

  const summary = `[${entry.severity || 'CRITICAL'}] ${entry.event}: ${entry.error || entry.path || 'Security alert'}`;
  const timestamp = entry.timestamp || new Date().toISOString();

  // Slack
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    sendAlertToChannel(slackUrl, {
      text: `\u{1F6A8} ${summary}\nIP: ${entry.ip}\nUser: ${entry.userId || 'N/A'}\nPath: ${entry.path}\nTime: ${timestamp}`,
    });
  }

  // PagerDuty
  const pagerDutyKey = process.env.PAGERDUTY_ROUTING_KEY;
  if (pagerDutyKey) {
    sendAlertToChannel('https://events.pagerduty.com/v2/enqueue', {
      routing_key: pagerDutyKey,
      event_action: 'trigger',
      payload: {
        summary,
        severity: (entry.severity || 'critical').toLowerCase(),
        source: 'api-platform',
        timestamp,
        custom_details: {
          event: entry.event,
          ip: entry.ip,
          userId: entry.userId,
          path: entry.path,
          requestId: entry.requestId,
        },
      },
    });
  }

  // Generic webhook
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    sendAlertToChannel(webhookUrl, {
      alert: {
        name: entry.event,
        severity: entry.severity || 'CRITICAL',
        description: entry.error || summary,
        value: entry.metadata?.value,
        threshold: entry.metadata?.threshold,
        timestamp,
      },
    });
  }
}

/**
 * Generate a request ID for security events
 */
function generateRequestId(): string {
  return `sec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Failed login tracking (for brute force detection)
 */
const failedLoginAttempts = new Map<string, number>();
const FAILED_LOGIN_THRESHOLD = 5;
const FAILED_LOGIN_WINDOW = 15 * 60 * 1000; // 15 minutes

/**
 * Track failed login attempt
 */
export function trackFailedLogin(ip: string, email?: string): boolean {
  const key = email || ip;
  const attempts = (failedLoginAttempts.get(key) || 0) + 1;
  failedLoginAttempts.set(key, attempts);

  // Clear after window
  setTimeout(() => {
    failedLoginAttempts.delete(key);
  }, FAILED_LOGIN_WINDOW);

  // Alert if threshold exceeded
  if (attempts >= FAILED_LOGIN_THRESHOLD) {
    logSecurityEvent(AuditEvent.USER_LOGIN_FAILED, {
      ip,
      description: `${attempts} failed login attempts for ${email || 'unknown user'}`,
      metadata: { attempts, threshold: FAILED_LOGIN_THRESHOLD },
    });
    return true; // Indicates brute force detected
  }

  return false;
}

/**
 * Clear failed login attempts (on successful login)
 */
export function clearFailedLoginAttempts(ip: string, email?: string): void {
  const key = email || ip;
  failedLoginAttempts.delete(key);
}

/**
 * Get audit statistics
 */
export interface AuditStats {
  totalEvents: number;
  securityEvents: number;
  failedLogins: number;
  activeUsers: number;
  activeAgents: number;
}

// Simple in-memory stats (replace with database in production)
const stats = {
  totalEvents: 0,
  securityEvents: 0,
  failedLogins: 0,
  uniqueUsers: new Set<string>(),
  uniqueAgents: new Set<string>(),
};

/**
 * Update statistics
 */
export function updateStats(entry: AuditLogEntry): void {
  stats.totalEvents++;

  if (entry.eventCategory === EventCategory.SECURITY) {
    stats.securityEvents++;
  }

  if (entry.event === AuditEvent.USER_LOGIN_FAILED) {
    stats.failedLogins++;
  }

  if (entry.userId) {
    stats.uniqueUsers.add(entry.userId);
  }

  if (entry.agentId) {
    stats.uniqueAgents.add(entry.agentId);
  }
}

/**
 * Get current statistics
 */
export function getAuditStats(): AuditStats {
  return {
    totalEvents: stats.totalEvents,
    securityEvents: stats.securityEvents,
    failedLogins: stats.failedLogins,
    activeUsers: stats.uniqueUsers.size,
    activeAgents: stats.uniqueAgents.size,
  };
}

/**
 * Export logger for direct use
 */
export { auditLogger };
