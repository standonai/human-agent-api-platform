import { ResourcePolicy } from '../types.js';
import { UserRole } from '../../types/auth.js';

/**
 * User resource authorization policy
 *
 * Rules:
 * - Only admins can create users
 * - Users can read their own profile, admins can read any
 * - Users can update their own profile (limited fields), admins can update any
 * - Only admins can delete users
 * - Only admins can list all users
 * - Critical fields (role, email) require admin privileges to modify
 */
export const userPolicy: ResourcePolicy = {
  resource: 'user',
  actions: {
    create: {
      allow: (ctx) => ctx.user?.role === UserRole.ADMIN,
      requireOwnership: false,
    },
    read: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (!ctx.resource) return false;
        return ctx.resource.id === ctx.user?.id;
      },
      requireOwnership: false,
    },
    update: {
      allow: (ctx) => {
        if (ctx.user?.role === UserRole.ADMIN) return true;
        if (!ctx.resource) return false;
        return ctx.resource.id === ctx.user?.id;
      },
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
      owner: ['id', 'email', 'role', 'createdAt', 'updatedAt'],  // Users can see their own data
      admin: ['*'],     // Admin sees everything (including hashed password for security audits)
      developer: ['id', 'email', 'role', 'createdAt'],
      viewer: ['id', 'email', 'createdAt'],
    },
    write: {
      owner: ['email', 'password'],  // Users can only change email and password
      admin: ['*'],     // Admin can modify everything (including role)
      developer: [],    // Developers can't modify users
      viewer: [],       // Viewers can't modify users
    },
  },
};
