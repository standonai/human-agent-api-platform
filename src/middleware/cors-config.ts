/**
 * CORS Configuration
 *
 * Restricts which origins can access the API from browsers.
 * Critical for preventing unauthorized cross-origin requests.
 */

import cors from 'cors';

/**
 * Parse allowed origins from environment variable
 * Format: comma-separated list of origins
 * Example: https://app.example.com,https://dashboard.example.com
 */
function getAllowedOrigins(): string[] {
  const originsEnv = process.env.ALLOWED_ORIGINS || '';

  // In development, allow localhost
  if (process.env.NODE_ENV === 'development' && !originsEnv) {
    return ['http://localhost:3000', 'http://localhost:3001'];
  }

  // In production, require explicit configuration
  if (!originsEnv && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: ALLOWED_ORIGINS not set in production. CORS will block all browser requests.');
    return [];
  }

  return originsEnv.split(',').map(origin => origin.trim()).filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();

/**
 * CORS Middleware Configuration
 *
 * Security features:
 * - Whitelist specific origins (no wildcards)
 * - Allow credentials (cookies, auth headers)
 * - Restrict methods to necessary HTTP verbs
 * - Control which headers can be sent/received
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy. Allowed origins: ${allowedOrigins.join(', ')}`));
    }
  },

  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Allow these HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Allow these request headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'API-Version',
    'X-Agent-ID',
    'X-Agent-Key',
    'X-Request-ID',
  ],

  // Expose these response headers to browser
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'Deprecation',
    'Sunset',
  ],

  // Cache preflight requests for 24 hours
  maxAge: 86400,

  // Pass CORS errors to next middleware
  optionsSuccessStatus: 204,
});

/**
 * Log CORS configuration on startup
 */
export function logCorsConfig(): void {
  console.log('🔒 CORS Configuration:');
  if (allowedOrigins.length === 0) {
    console.log('   ⚠️  No origins allowed (API accessible only by non-browser clients)');
  } else {
    console.log('   ✅ Allowed origins:');
    allowedOrigins.forEach(origin => console.log(`      - ${origin}`));
  }
}
