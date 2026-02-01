import { ResourcePolicy } from '../types.js';
import { UserRole } from '../../types/auth.js';

/**
 * Task resource authorization policy
 *
 * Rules:
 * - Anyone (authenticated) can create tasks
 * - Only owners and admins can read/update/delete specific tasks
 * - Everyone can list tasks (filtered to their own)
 * - Field-level access based on ownership and role
 */
export const taskPolicy: ResourcePolicy = {
  resource: 'task',
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
        return ownerId === ctx.user?.id || ownerId === ctx.agent?.id;
      },
      requireOwnership: true,
    },
    update: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (!ctx.resource) return false;
        const ownerId = ctx.resource.ownerId || ctx.resource.createdBy;
        return ownerId === ctx.user?.id || ownerId === ctx.agent?.id;
      },
      requireOwnership: true,
    },
    delete: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (!ctx.resource) return false;
        const ownerId = ctx.resource.ownerId || ctx.resource.createdBy;
        return ownerId === ctx.user?.id || ownerId === ctx.agent?.id;
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
      owner: ['*'],     // Owner sees everything
      admin: ['*'],     // Admin sees everything
      developer: ['id', 'title', 'description', 'status', 'assignee', 'createdAt', 'updatedAt', 'createdBy', 'ownerId'],
      viewer: ['id', 'title', 'status', 'createdAt'],
    },
    write: {
      owner: ['title', 'description', 'status', 'assignee'],
      admin: ['*'],     // Admin can modify everything
      developer: [],    // Developers can't modify tasks they don't own
      viewer: [],       // Viewers can't modify tasks
    },
  },
};
