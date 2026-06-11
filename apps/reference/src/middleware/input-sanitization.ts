/**
 * Input Sanitization Middleware
 *
 * Protects against:
 * - XSS (Cross-Site Scripting)
 * - SQL Injection
 * - Command Injection
 * - Path Traversal
 * - NoSQL Injection
 */

import { Request, Response, NextFunction } from 'express';
import xss from 'xss';
import validator from 'validator';
import { ErrorCode } from '../types/errors.js';
import { withDocUrl } from '../utils/docs-url.js';

/**
 * XSS Options - Allow safe HTML for specific use cases
 */
const xssOptions = {
  whiteList: {}, // No HTML tags allowed by default
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

/**
 * Detect SQL injection patterns
 */
function detectSQLInjection(input: string): boolean {
  const sqlPatterns = [
    // SQL keywords
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/i,
    // SQL operators and comments
    /(UNION.*SELECT)/i,
    /('|")\s*(OR|AND)\s*('|")\s*=\s*('|")/i,
    /(-{2}|\/\*|\*\/|;)/,
    // SQL functions
    /(\b(CONCAT|CHAR|ASCII|SUBSTRING|CAST|CONVERT)\s*\()/i,
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Detect NoSQL injection patterns (MongoDB)
 */
function detectNoSQLInjection(input: string): boolean {
  const noSqlPatterns = [
    /(\$where|\$ne|\$gt|\$lt|\$gte|\$lte|\$regex|\$exists)/i,
    /(\{\s*\$)/,
  ];

  return noSqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Detect command injection patterns
 */
function detectCommandInjection(input: string): boolean {
  const commandPatterns = [
    // Shell operators (more specific - avoid JSON false positives)
    /[;&|`]\s*\w+/,  // Semicolon/pipe/backtick followed by word (actual command)
    /\$\(/,           // Command substitution
    />\s*\/\w+/,      // Redirect to file path
    // Common dangerous commands with context
    /(\b(bash|sh|cmd|powershell)\s+-c\b)/i,
    /(\b(wget|curl)\s+http)/i,
    /(\b(nc|netcat)\s+\d)/i,
    /(\b(rm|rmdir)\s+-[rf])/i,
    /(\beval\s*\()/i,
  ];

  return commandPatterns.some(pattern => pattern.test(input));
}

/**
 * Detect path traversal patterns
 */
function detectPathTraversal(input: string): boolean {
  const pathPatterns = [
    /\.\./,           // Parent directory
    /\/\//,           // Double slashes
    /\\/,             // Backslashes
    /%2e%2e/i,        // URL encoded ..
    /%252e/i,         // Double URL encoded
    /\0/,             // Null bytes
  ];

  return pathPatterns.some(pattern => pattern.test(input));
}

/**
 * Detect potentially dangerous characters
 */
function detectDangerousChars(input: string): boolean {
  // Check for control characters (except common ones like \n, \t)
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  return controlChars.test(input);
}

/**
 * Sanitize a single string value
 */
function sanitizeString(value: string, options: SanitizationOptions = {}): string {
  if (typeof value !== 'string') {
    return value;
  }

  let sanitized = value;

  // 1. Remove dangerous control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Normalize unicode (prevent unicode-based attacks)
  sanitized = sanitized.normalize('NFKC');

  // 3. Trim whitespace
  sanitized = sanitized.trim();

  // 4. Apply XSS filtering if enabled
  if (options.allowHtml) {
    // Allow limited HTML (for rich text editors)
    sanitized = xss(sanitized, {
      whiteList: {
        b: [], i: [], u: [], strong: [], em: [],
        p: [], br: [], a: ['href', 'title'],
      },
    });
  } else {
    // Strip all HTML
    sanitized = xss(sanitized, xssOptions);
  }

  // 5. Limit length to prevent memory exhaustion
  if (options.maxLength && sanitized.length > options.maxLength) {
    sanitized = sanitized.substring(0, options.maxLength);
  }

  return sanitized;
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any, options: SanitizationOptions = {}): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj, options);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, options));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both key and value
      const sanitizedKey = sanitizeString(key, { maxLength: 100 });
      sanitized[sanitizedKey] = sanitizeObject(value, options);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitization options
 */
interface SanitizationOptions {
  allowHtml?: boolean;
  maxLength?: number;
}

/**
 * Input sanitization middleware
 *
 * Sanitizes all string inputs in body, query, and params
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  try {
    // Sanitize body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error('Sanitization error:', error);
    res.status(400).json({
      error: {
        code: ErrorCode.INVALID_PARAMETER,
        message: 'Invalid input format',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'SANITIZATION_FAILED',
          message: 'Input could not be processed',
          suggestion: 'Check your input for invalid characters',
        }],
      },
    });
  }
}

/**
 * Injection attack detection middleware
 *
 * Detects and blocks common injection attacks
 */
export function detectInjectionAttacks(req: Request, res: Response, next: NextFunction): void {
  // Exempt endpoints that legitimately accept arbitrary structured data (e.g. OpenAPI specs)
  if (req.path.startsWith('/api/convert')) {
    next();
    return;
  }

  // Combine all inputs for analysis
  const allInputs = JSON.stringify({
    body: req.body || {},
    query: req.query || {},
    params: req.params || {},
  });

  // Check for SQL injection
  if (detectSQLInjection(allInputs)) {
    console.warn(`🚨 SQL injection attempt detected from IP ${req.ip}`, {
      path: req.path,
      method: req.method,
      userId: (req as any).user?.id,
      sample: allInputs.substring(0, 200),
    });

    res.status(400).json({
      error: {
        code: ErrorCode.INVALID_PARAMETER,
        message: 'Invalid input detected',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'SUSPICIOUS_INPUT',
          message: 'Input contains suspicious patterns',
          suggestion: 'Remove special characters and try again',
        }],
        ...withDocUrl('/security/input-validation'),
      },
    });
    return;
  }

  // Check for NoSQL injection
  if (detectNoSQLInjection(allInputs)) {
    console.warn(`🚨 NoSQL injection attempt detected from IP ${req.ip}`, {
      path: req.path,
      method: req.method,
    });

    res.status(400).json({
      error: {
        code: ErrorCode.INVALID_PARAMETER,
        message: 'Invalid input detected',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'SUSPICIOUS_INPUT',
          message: 'Input contains database query operators',
          suggestion: 'Remove special characters from your input',
        }],
      },
    });
    return;
  }

  // Check for command injection
  if (detectCommandInjection(allInputs)) {
    console.warn(`🚨 Command injection attempt detected from IP ${req.ip}`, {
      path: req.path,
      method: req.method,
    });

    res.status(400).json({
      error: {
        code: ErrorCode.INVALID_PARAMETER,
        message: 'Invalid input detected',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'SUSPICIOUS_INPUT',
          message: 'Input contains command execution patterns',
          suggestion: 'Remove shell operators from your input',
        }],
      },
    });
    return;
  }

  // Check URL path for traversal attempts
  if (detectPathTraversal(req.path) || detectPathTraversal(allInputs)) {
    console.warn(`🚨 Path traversal attempt detected from IP ${req.ip}`, {
      path: req.path,
      method: req.method,
    });

    res.status(400).json({
      error: {
        code: ErrorCode.INVALID_PARAMETER,
        message: 'Invalid path or input',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'INVALID_PATH',
          message: 'Path contains traversal patterns',
          suggestion: 'Use valid file paths without .. or special characters',
        }],
      },
    });
    return;
  }

  next();
}

/**
 * Email validation middleware
 */
export function validateEmail(email: string): boolean {
  return validator.isEmail(email);
}

/**
 * URL validation middleware
 */
export function validateURL(url: string): boolean {
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
  });
}

/**
 * UUID validation
 */
export function validateUUID(uuid: string): boolean {
  return validator.isUUID(uuid);
}

/**
 * Alphanumeric validation (for IDs, slugs, etc.)
 */
export function validateAlphanumeric(str: string): boolean {
  return validator.isAlphanumeric(str);
}

/**
 * Safe string validation (alphanumeric + basic punctuation)
 */
export function validateSafeString(str: string): boolean {
  // Allow letters, numbers, spaces, and basic punctuation
  const safePattern = /^[a-zA-Z0-9\s.,!?'"-]*$/;
  return safePattern.test(str);
}

/**
 * Export sanitization utilities for use in route handlers
 */
export const sanitization = {
  sanitizeString,
  sanitizeObject,
  validateEmail,
  validateURL,
  validateUUID,
  validateAlphanumeric,
  validateSafeString,
  detectSQLInjection,
  detectNoSQLInjection,
  detectCommandInjection,
  detectPathTraversal,
  detectDangerousChars,
};
