/**
 * API versioning types.
 * Platform uses date-based versioning via API-Version header.
 */

export interface ApiVersion {
  version: string; // Format: YYYY-MM-DD
  deprecated?: boolean;
  sunset?: Date;
}

export interface DeprecationInfo {
  deprecationDate: Date;
  sunsetDate: Date;
  migrationGuide: string;
  replacementVersion: string;
}
