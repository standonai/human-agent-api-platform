/**
 * TLS/HTTPS Configuration
 *
 * Handles SSL/TLS certificate loading and HTTPS server setup
 */

import { readFileSync, existsSync } from 'fs';
import https from 'https';
import { Application } from 'express';
import { SecureVersion } from 'tls';

/**
 * TLS Configuration Options
 */
export interface TLSOptions {
  key: string;
  cert: string;
  ca?: string;
  minVersion?: SecureVersion;
  ciphers?: string;
}

/**
 * Get TLS options from environment or files
 */
export function getTLSOptions(): TLSOptions | null {
  const keyPath = process.env.SSL_KEY_PATH || process.env.TLS_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH || process.env.TLS_CERT_PATH;
  const caPath = process.env.SSL_CA_PATH || process.env.TLS_CA_PATH;

  // Check if TLS is disabled
  if (process.env.DISABLE_TLS === 'true') {
    console.log('ℹ️  TLS disabled via DISABLE_TLS environment variable');
    return null;
  }

  // In development, TLS is optional
  if (process.env.NODE_ENV === 'development' && !keyPath && !certPath) {
    console.log('ℹ️  TLS not configured for development (using HTTP)');
    console.log('   To enable HTTPS in development, run: npm run generate:certs');
    return null;
  }

  // In production, TLS is required
  if (process.env.NODE_ENV === 'production' && (!keyPath || !certPath)) {
    throw new Error(
      'TLS certificate paths must be set in production! ' +
      'Set SSL_KEY_PATH and SSL_CERT_PATH environment variables.'
    );
  }

  if (!keyPath || !certPath) {
    return null;
  }

  // Check if files exist
  if (!existsSync(keyPath)) {
    throw new Error(`TLS key file not found: ${keyPath}`);
  }

  if (!existsSync(certPath)) {
    throw new Error(`TLS certificate file not found: ${certPath}`);
  }

  try {
    const options: TLSOptions = {
      key: readFileSync(keyPath, 'utf8'),
      cert: readFileSync(certPath, 'utf8'),
      // TLS 1.2 minimum (TLS 1.3 preferred)
      minVersion: 'TLSv1.2' as SecureVersion,
      // Strong cipher suites only (forward secrecy)
      ciphers: [
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
      ].join(':'),
    };

    // Optional CA certificate (for intermediate certificates)
    if (caPath && existsSync(caPath)) {
      options.ca = readFileSync(caPath, 'utf8');
    }

    return options;
  } catch (error) {
    throw new Error(`Failed to load TLS certificates: ${error}`);
  }
}

/**
 * Create HTTPS server
 */
export function createHTTPSServer(app: Application): https.Server {
  const tlsOptions = getTLSOptions();

  if (!tlsOptions) {
    throw new Error('TLS options not available. Cannot create HTTPS server.');
  }

  return https.createServer(tlsOptions, app);
}

/**
 * Check if TLS is enabled
 */
export function isTLSEnabled(): boolean {
  if (process.env.DISABLE_TLS === 'true') {
    return false;
  }

  const keyPath = process.env.SSL_KEY_PATH || process.env.TLS_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH || process.env.TLS_CERT_PATH;

  return !!(keyPath && certPath && existsSync(keyPath) && existsSync(certPath));
}

/**
 * Get recommended certificate information
 */
export function getCertificateInfo(): string {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    return `
Production TLS Setup:

1. Obtain SSL certificates from a Certificate Authority:
   - Let's Encrypt (free): https://letsencrypt.org/
   - Commercial CA: DigiCert, GlobalSign, etc.

2. Set environment variables:
   SSL_KEY_PATH=/path/to/private.key
   SSL_CERT_PATH=/path/to/certificate.crt
   SSL_CA_PATH=/path/to/ca-bundle.crt (optional)

3. Ensure files have correct permissions:
   chmod 600 /path/to/private.key
   chmod 644 /path/to/certificate.crt
`;
  } else {
    return `
Development TLS Setup:

1. Generate self-signed certificates:
   npm run generate:certs

2. Or manually:
   openssl req -x509 -newkey rsa:4096 -nodes \\
     -keyout certs/localhost-key.pem \\
     -out certs/localhost-cert.pem \\
     -days 365 \\
     -subj "/CN=localhost"

3. Set environment variables in .env:
   SSL_KEY_PATH=./certs/localhost-key.pem
   SSL_CERT_PATH=./certs/localhost-cert.pem

Note: Self-signed certificates will show browser warnings.
      This is normal for development.
`;
  }
}

/**
 * Log TLS configuration status
 */
export function logTLSStatus(): void {
  const enabled = isTLSEnabled();
  const env = process.env.NODE_ENV || 'development';

  if (enabled) {
    console.log('🔒 TLS/HTTPS: Enabled');
    console.log(`   Protocol: TLS 1.2+`);
    console.log(`   Environment: ${env}`);

    if (env === 'production') {
      console.log('   ✓ Production-grade encryption active');
    } else {
      console.log('   ⚠️  Using development certificates');
      console.log('   ⚠️  Browser will show security warnings');
    }
  } else {
    console.log('ℹ️  TLS/HTTPS: Disabled');
    console.log(`   Running HTTP only (port ${process.env.PORT || 3000})`);

    if (env === 'production') {
      console.error('⚠️  WARNING: Running production without HTTPS!');
      console.error('   This is INSECURE and not recommended.');
      console.error('   Configure TLS certificates immediately.');
    } else {
      console.log('   To enable HTTPS: npm run generate:certs');
    }
  }
}
