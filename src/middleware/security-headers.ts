/**
 * Security Headers Middleware
 *
 * Implements security best practices through HTTP headers.
 * Protects against common web vulnerabilities.
 */

import helmet from 'helmet';
import { RequestHandler } from 'express';

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function isProduction(): boolean {
  return (process.env.NODE_ENV || 'development') === 'production';
}

/**
 * Security Headers Configuration
 *
 * Implements OWASP recommended security headers:
 * - HSTS: Force HTTPS connections
 * - CSP: Prevent XSS attacks
 * - X-Frame-Options: Prevent clickjacking
 * - X-Content-Type-Options: Prevent MIME sniffing
 * - Referrer-Policy: Control referrer information
 * - X-DNS-Prefetch-Control: Control DNS prefetching
 */
export function securityHeaders(): RequestHandler {
  const hstsEnabled = getBooleanEnv('SECURITY_HSTS_ENABLED', isProduction());
  const cspUpgradeInsecure = getBooleanEnv(
    'SECURITY_CSP_UPGRADE_INSECURE_REQUESTS',
    isProduction()
  );
  const hstsMaxAge = parseInt(process.env.SECURITY_HSTS_MAX_AGE_SECONDS || '31536000', 10);

  const cspDirectives: Record<string, Iterable<string>> = {
    // Default: Only load resources from same origin
    defaultSrc: ["'self'"],

    // Scripts: Only from same origin (no inline scripts)
    scriptSrc: ["'self'"],

    // Styles: Same origin + inline styles (needed for dashboard)
    styleSrc: ["'self'", "'unsafe-inline'"],

    // Images: Same origin + data URIs + HTTPS
    imgSrc: ["'self'", 'data:', 'https:'],

    // AJAX/WebSocket: Same origin only
    connectSrc: ["'self'"],

    // Fonts: Same origin only
    fontSrc: ["'self'"],

    // Objects/Embeds: None allowed
    objectSrc: ["'none'"],

    // Media: None allowed
    mediaSrc: ["'none'"],

    // Frames: None allowed (prevents clickjacking)
    frameSrc: ["'none'"],

    // Base URI: Same origin only
    baseUri: ["'self'"],

    // Form actions: Same origin only
    formAction: ["'self'"],

    // Frame ancestors: None (defense in depth with X-Frame-Options)
    frameAncestors: ["'none'"],
  };

  if (cspUpgradeInsecure) {
    cspDirectives.upgradeInsecureRequests = [];
  }

  return helmet({
  /**
   * HTTP Strict Transport Security (HSTS)
   * Forces browsers to use HTTPS for 1 year
   * Prevents downgrade attacks and cookie hijacking
   */
    hsts: hstsEnabled
      ? {
          maxAge: Number.isNaN(hstsMaxAge) || hstsMaxAge <= 0 ? 31536000 : hstsMaxAge,
          includeSubDomains: true,
          preload: true,
        }
      : false,

  /**
   * Content Security Policy (CSP)
   * Prevents XSS, clickjacking, and other code injection attacks
   * Controls which resources can be loaded
   */
    contentSecurityPolicy: {
      directives: cspDirectives,
    },

  /**
   * X-Frame-Options
   * Prevents the page from being embedded in iframes
   * Protects against clickjacking attacks
   */
  frameguard: {
    action: 'deny', // Don't allow any framing
  },

  /**
   * X-Content-Type-Options
   * Prevents browsers from MIME-sniffing
   * Forces browser to respect Content-Type header
   */
  noSniff: true,

  /**
   * X-XSS-Protection
   * Legacy XSS protection (modern browsers use CSP)
   * Kept for older browser compatibility
   */
  xssFilter: true,

  /**
   * Referrer-Policy
   * Controls how much referrer information is sent
   * Protects user privacy and prevents information leakage
   */
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  /**
   * X-DNS-Prefetch-Control
   * Disables DNS prefetching to prevent privacy leakage
   */
  dnsPrefetchControl: {
    allow: false,
  },

  /**
   * X-Download-Options
   * Prevents IE from executing downloads in site context
   */
  ieNoOpen: true,

  /**
   * Remove X-Powered-By header
   * Hides technology stack information from attackers
   */
  hidePoweredBy: true,

  /**
   * X-Permitted-Cross-Domain-Policies
   * Restricts Adobe Flash and PDF cross-domain requests
   */
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
  });
}

/**
 * Additional custom security headers
 * Applied after Helmet middleware
 */
export function customSecurityHeaders(req: any, res: any, next: any): void {
  // Remove server information
  res.removeHeader('X-Powered-By');

  // Add custom security header
  res.setHeader('X-API-Version', '1.0.0');

  // Prevent caching of sensitive data
  if (req.path.includes('/api/users') || req.path.includes('/api/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
}

/**
 * Log security headers configuration on startup
 */
export function logSecurityHeaders(): void {
  const hstsEnabled = getBooleanEnv('SECURITY_HSTS_ENABLED', isProduction());
  const cspUpgradeInsecure = getBooleanEnv(
    'SECURITY_CSP_UPGRADE_INSECURE_REQUESTS',
    isProduction()
  );
  const hstsMaxAge = parseInt(process.env.SECURITY_HSTS_MAX_AGE_SECONDS || '31536000', 10);

  console.log('🔒 Security Headers Enabled:');
  console.log(
    `   ${hstsEnabled ? '✅' : '⚠️ '} HSTS (${hstsEnabled ? `enabled, max-age ${Number.isNaN(hstsMaxAge) ? 31536000 : hstsMaxAge}s` : 'disabled'})`
  );
  console.log('   ✅ CSP (Content Security Policy)');
  console.log(
    `   ${cspUpgradeInsecure ? '✅' : '⚠️ '} CSP upgrade-insecure-requests (${cspUpgradeInsecure ? 'enabled' : 'disabled'})`
  );
  console.log('   ✅ X-Frame-Options (Deny)');
  console.log('   ✅ X-Content-Type-Options (nosniff)');
  console.log('   ✅ Referrer-Policy (strict-origin-when-cross-origin)');
  console.log('   ✅ X-XSS-Protection (Enabled)');
  console.log('   ✅ X-Powered-By (Hidden)');
}
