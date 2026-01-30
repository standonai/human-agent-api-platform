#!/usr/bin/env node
/**
 * CLI Tool: Sync OpenAPI Spec to Gateway
 *
 * Usage:
 *   npm run gateway:sync
 *   npm run gateway:status
 */

import { GatewayManager } from '../gateway/gateway-manager.js';

async function main() {
  const command = process.argv[2] || 'sync';
  const manager = new GatewayManager();

  if (!manager.isEnabled()) {
    console.error('❌ No gateway configured');
    console.log('');
    console.log('To configure a gateway, set these environment variables:');
    console.log('  GATEWAY_PROVIDER=kong');
    console.log('  GATEWAY_ADMIN_URL=http://localhost:8001');
    console.log('  GATEWAY_API_KEY=<your-api-key> (optional)');
    console.log('  GATEWAY_AUTO_SYNC=true (optional)');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'sync':
        await manager.initialize();
        await manager.syncOpenAPISpec();
        break;

      case 'status':
        const health = await manager.getHealth();
        console.log('Gateway Status:');
        console.log(`  Enabled: ${health.enabled}`);
        console.log(`  Healthy: ${health.healthy}`);
        console.log(`  Provider: ${health.provider || 'none'}`);
        console.log(`  Version: ${health.version || 'unknown'}`);
        break;

      case 'health':
        const gateway = manager.getGateway();
        if (!gateway) {
          console.error('Gateway not configured');
          process.exit(1);
        }
        const isHealthy = await gateway.healthCheck();
        console.log(isHealthy ? '✅ Gateway is healthy' : '❌ Gateway is unhealthy');
        process.exit(isHealthy ? 0 : 1);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Available commands: sync, status, health');
        process.exit(1);
    }

    process.exit(0);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
