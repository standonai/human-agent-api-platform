/**
 * HTTPS Redirect Middleware
 *
 * Redirects HTTP requests to HTTPS in production
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Redirect HTTP to HTTPS middleware
 *
 * Only applies in production when TLS is enabled
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  // Check if request is already HTTPS
  const isHTTPS =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.protocol === 'https';

  if (!isHTTPS) {
    // Construct HTTPS URL
    const httpsUrl = `https://${req.hostname}${req.url}`;

    // Log redirect (for monitoring)
    console.log(`🔒 HTTP → HTTPS redirect: ${req.method} ${req.url}`);

    // 301 Permanent Redirect
    res.redirect(301, httpsUrl);
    return;
  }

  next();
}

/**
 * Require HTTPS middleware
 *
 * Blocks non-HTTPS requests in production
 */
export function requireHTTPS(req: Request, res: Response, next: NextFunction): void {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const isHTTPS =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.protocol === 'https';

  if (!isHTTPS) {
    res.status(403).json({
      error: {
        code: 'HTTPS_REQUIRED',
        message: 'HTTPS is required for this endpoint',
        request_id: req.requestId || 'unknown',
        details: [{
          code: 'INSECURE_CONNECTION',
          message: 'This API requires a secure HTTPS connection',
          suggestion: 'Use https:// instead of http:// in your request URL',
        }],
        doc_url: 'https://docs.example.com/security/https',
      },
    });
    return;
  }

  next();
}

/**
 * Log TLS connection information
 */
export function logTLSConnection(req: Request, _res: Response, next: NextFunction): void {
  if (req.secure) {
    const cipher = (req.socket as any).getCipher?.();

    if (cipher) {
      console.log(`🔐 TLS Connection: ${cipher.name} (${cipher.version})`);
    }
  }

  next();
}
