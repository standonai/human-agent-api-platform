import { ResourcePolicy } from '../types.js';
import { UserRole } from '../../types/auth.js';

/**
 * Agent resource authorization policy
 *
 * Rules:
 * - Authenticated users/agents can create agents
 * - Users can read/update/delete their own agents, admins can access any
 * - Users can list their own agents, admins can list all
 * - API keys are never exposed in read operations
 */
export const agentPolicy: ResourcePolicy = {
  resource: 'agent',
  actions: {
    create: {
      allow: (ctx) => !!(ctx.user || ctx.agent),
      requireOwnership: false,
    },
    read: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (!ctx.resource) return false;
        const ownerId = ctx.resource.ownerId || ctx.resource.createdBy;
        return ownerId === ctx.user?.id;
      },
      requireOwnership: true,
    },
    update: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (!ctx.resource) return false;
        const ownerId = ctx.resource.ownerId || ctx.resource.createdBy;
        return ownerId === ctx.user?.id;
      },
      requireOwnership: true,
    },
    delete: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (!ctx.resource) return false;
        const ownerId = ctx.resource.ownerId || ctx.resource.createdBy;
        return ownerId === ctx.user?.id;
      },
      requireOwnership: true,
    },
    list: {
      allow: (ctx) => !!(ctx.user || ctx.agent),
      requireOwnership: false,
    },
  },
  fields: {
    read: {
      owner: ['id', 'name', 'active', 'createdAt', 'lastUsed', 'createdBy', 'ownerId'],  // Never expose API key
      admin: ['id', 'name', 'active', 'createdAt', 'lastUsed', 'createdBy', 'ownerId'],  // Even admin doesn't see hashed key
      developer: ['id', 'name', 'active', 'createdAt'],
      viewer: ['id', 'name', 'active', 'createdAt'],
    },
    write: {
      owner: ['name', 'active'],  // Owner can update name and active status
      admin: ['name', 'active', 'ownerId'],  // Admin can also change ownership
      developer: [],
      viewer: [],
    },
  },
};
