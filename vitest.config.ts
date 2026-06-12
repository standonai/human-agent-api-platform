import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against package source, never stale dist builds.
    alias: {
      '@standonai/agent-errors': resolve(root, 'packages/agent-errors/src'),
      '@standonai/agent-dry-run': resolve(root, 'packages/agent-dry-run/src'),
      '@standonai/agent-metrics': resolve(root, 'packages/agent-metrics/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '**/dist/',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
    },
  },
});
