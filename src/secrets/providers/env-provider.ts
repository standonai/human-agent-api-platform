/**
 * Environment Variables Provider
 *
 * Simple fallback provider that reads from process.env
 * Always available, no external dependencies
 */

import { SecretsProvider, SecretValue } from '../secrets-manager.js';

export class EnvironmentProvider implements SecretsProvider {
  name = 'environment';

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async getSecret(key: string): Promise<SecretValue | null> {
    const value = process.env[key];

    if (!value) {
      return null;
    }

    return {
      value,
      version: 'env',
      createdAt: new Date(),
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
