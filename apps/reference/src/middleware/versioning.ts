/**
 * API Versioning middleware
 * Implements header-based versioning with deprecation support
 */

import { Request, Response, NextFunction } from 'express';
import { ApiVersion, DeprecationInfo } from '../types/versioning.js';

declare global {
  namespace Express {
    interface Request {
      apiVersion: string;
    }
  }
}

export interface VersionConfig {
  defaultVersion: string;
  supportedVersions: ApiVersion[];
  deprecatedVersions: Map<string, DeprecationInfo>;
}

/**
 * Create versioning middleware
 */
export function versioningMiddleware(config: VersionConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract version from header (format: YYYY-MM-DD)
    const requestedVersion = req.headers['api-version'] as string;

    // Use requested version if valid, otherwise use default
    const version = requestedVersion && isValidVersion(requestedVersion, config)
      ? requestedVersion
      : config.defaultVersion;

    req.apiVersion = version;

    // Add version to response headers
    res.setHeader('API-Version', version);

    // Check if version is deprecated and add deprecation headers
    const deprecationInfo = config.deprecatedVersions.get(version);
    if (deprecationInfo) {
      res.setHeader('Deprecation', deprecationInfo.deprecationDate.toUTCString());
      res.setHeader('Sunset', deprecationInfo.sunsetDate.toUTCString());
      res.setHeader('Link', `<${deprecationInfo.migrationGuide}>; rel="deprecation"`);

      // Add warning header (RFC 7234)
      const daysUntilSunset = Math.ceil(
        (deprecationInfo.sunsetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      res.setHeader(
        'Warning',
        `299 - "API version ${version} is deprecated and will be sunset in ${daysUntilSunset} days. Please migrate to ${deprecationInfo.replacementVersion}."`
      );
    }

    next();
  };
}

/**
 * Validate version format (YYYY-MM-DD) and check if supported
 */
function isValidVersion(version: string, config: VersionConfig): boolean {
  // Check format
  const versionRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!versionRegex.test(version)) {
    return false;
  }

  // Check if version is supported
  return config.supportedVersions.some(v => v.version === version);
}

/**
 * Helper to check if a version is supported
 */
export function isSupportedVersion(version: string, config: VersionConfig): boolean {
  return config.supportedVersions.some(v => v.version === version);
}

/**
 * Helper to get the latest version
 */
export function getLatestVersion(config: VersionConfig): string {
  const versions = config.supportedVersions
    .map(v => v.version)
    .sort()
    .reverse();
  return versions[0] || config.defaultVersion;
}
