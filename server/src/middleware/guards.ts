import type { RequestHandler } from 'express';
import type { Permission } from '@inventory/shared';
import { requireActive } from './requireActive.js';
import { requireAuth } from './requireAuth.js';
import { requirePasswordChanged } from './requirePasswordChanged.js';
import { requirePermission } from './requirePermission.js';
import { requireVerified } from './requireVerified.js';

// Routes spread one of these (`router.get('/', ...can(PERMISSIONS.INVENTORY_VIEW), handler)`) instead of
// chaining guards by hand. Roles map to permissions in @inventory/shared (ROLE_PERMISSIONS).

/**
 * A session only. For self-service routes that gated users must still reach: /auth/me,
 * resend-verification, change-email and change-password.
 */
export const signedIn: RequestHandler[] = [requireAuth];

/** Verified, active, not on a temporary password. Every data route builds on this through `can`. */
export const authenticated: RequestHandler[] = [requireAuth, requireVerified, requireActive, requirePasswordChanged];

/** `authenticated` plus every one of `permissions` (PRD §2 matrix). */
export const can = (...permissions: Permission[]): RequestHandler[] => [
  ...authenticated,
  requirePermission(...permissions),
];
