/**
 * Audit Log API Routes
 *
 * View audit logs and statistics (admin only)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import { UserRole } from '../types/auth.js';
import { getAuditStats } from '../observability/audit-logger.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const router = Router();

/**
 * GET /api/audit/stats
 * Get audit statistics
 *
 * Requires: Admin authentication
 */
router.get('/stats', requireAuth, requireRole(UserRole.ADMIN), (_req: Request, res: Response) => {
  const stats = getAuditStats();

  res.status(200).json({
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/audit/logs
 * Get recent audit logs
 *
 * Requires: Admin authentication
 */
router.get('/logs', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const logType = (req.query.type as string) || 'audit';

    // Determine which log file to read
    const logsDir = 'logs';
    const today = new Date().toISOString().split('T')[0];
    const logFile = logType === 'security'
      ? `security-${today}.log`
      : `audit-${today}.log`;

    const logPath = join(logsDir, logFile);

    // Check if log file exists
    if (!existsSync(logPath)) {
      res.status(200).json({
        data: [],
        meta: {
          message: 'No logs available for today',
          logFile,
        },
      });
      return;
    }

    // Read last N lines from log file
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    const recentLines = lines.slice(-limit);

    // Parse JSON log entries
    const logs = recentLines
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      })
      .reverse(); // Most recent first

    res.status(200).json({
      data: logs,
      meta: {
        total: logs.length,
        logFile,
        limit,
      },
    });
  } catch (error) {
    console.error('Error reading audit logs:', error);
    res.status(500).json({
      error: {
        code: 'LOG_READ_ERROR',
        message: 'Failed to read audit logs',
        request_id: req.requestId || 'unknown',
      },
    });
  }
});

/**
 * GET /api/audit/files
 * List available log files
 *
 * Requires: Admin authentication
 */
router.get('/files', requireAuth, requireRole(UserRole.ADMIN), (_req: Request, res: Response) => {
  try {
    const logsDir = 'logs';

    if (!existsSync(logsDir)) {
      res.status(200).json({
        data: [],
        meta: { message: 'No log directory found' },
      });
      return;
    }

    const files = readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = join(logsDir, file);
        const stats = statSync(filePath);

        return {
          name: file,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    res.status(200).json({
      data: files,
      meta: {
        total: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      },
    });
  } catch (error) {
    console.error('Error listing log files:', error);
    res.status(500).json({
      error: {
        code: 'LOG_LIST_ERROR',
        message: 'Failed to list log files',
      },
    });
  }
});

/**
 * GET /api/audit/search
 * Search audit logs
 *
 * Requires: Admin authentication
 */
router.get('/search', requireAuth, requireRole(UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const agentId = req.query.agentId as string;
    const event = req.query.event as string;
    const ip = req.query.ip as string;
    const limit = parseInt(req.query.limit as string) || 100;

    const logsDir = 'logs';
    const today = new Date().toISOString().split('T')[0];
    const logPath = join(logsDir, `audit-${today}.log`);

    if (!existsSync(logPath)) {
      res.status(200).json({
        data: [],
        meta: { message: 'No logs available' },
      });
      return;
    }

    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Parse and filter logs
    const matchingLogs = lines
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(log => {
        if (!log) return false;

        if (userId && log.userId !== userId) return false;
        if (agentId && log.agentId !== agentId) return false;
        if (event && log.event !== event) return false;
        if (ip && log.ip !== ip) return false;

        return true;
      })
      .slice(-limit)
      .reverse();

    res.status(200).json({
      data: matchingLogs,
      meta: {
        total: matchingLogs.length,
        filters: { userId, agentId, event, ip },
      },
    });
  } catch (error) {
    console.error('Error searching logs:', error);
    res.status(500).json({
      error: {
        code: 'LOG_SEARCH_ERROR',
        message: 'Failed to search logs',
      },
    });
  }
});

/**
 * Helper: Check if file/directory exists
 */
function existsSync(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper: Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default router;
