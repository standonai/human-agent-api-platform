import { ResourcePolicy } from '../types.js';
import { UserRole } from '../../types/auth.js';

/**
 * Secret resource authorization policy
 *
 * Rules:
 * - Only admins and developers can create secrets
 * - Only admins can read/update/delete secrets
 * - Secret values are never exposed in responses (even to admins)
 * - Metadata only visible to authorized users
 */
export const secretPolicy: ResourcePolicy = {
  resource: 'secret',
  actions: {
    create: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (ctx.user?.role === UserRole.DEVELOPER) return true;
        return false;
      },
      requireOwnership: false,
    },
    read: {
      allow: (ctx) => ctx.user?.role === UserRole.ADMIN,
      requireOwnership: false,
    },
    update: {
      allow: (ctx) => ctx.user?.role === UserRole.ADMIN,
      requireOwnership: false,
    },
    delete: {
      allow: (ctx) => ctx.user?.role === UserRole.ADMIN,
      requireOwnership: false,
    },
    list: {
      allow: (ctx) => ctx.user?.role === UserRole.ADMIN,
      requireOwnership: false,
    },
  },
  fields: {
    read: {
      owner: ['key', 'version', 'createdAt', 'updatedAt', 'expiresAt'],  // Never include 'value'
      admin: ['key', 'version', 'createdAt', 'updatedAt', 'expiresAt'],  // Never include 'value'
      developer: ['key', 'version', 'createdAt'],
      viewer: [],  // Viewers can't see secrets
    },
    write: {
      owner: [],  // Secrets can't be updated, only rotated (new version)
      admin: [],  // Secrets can't be updated, only rotated (new version)
      developer: [],
      viewer: [],
    },
  },
};
