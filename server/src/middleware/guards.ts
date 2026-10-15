import type { Request, RequestHandler, Response } from 'express';
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

/**
 * Runs a guard chain inside a handler, for a route that is open but has one branch that needs a user
 * (the LINK branch of /auth/telegram/verify). Throws the first guard's error; sets req.user.
 */
export const assertGuards = async (req: Request, guards: RequestHandler[]): Promise<void> => {
  for (const guard of guards) {
    await new Promise<void>((resolve, reject) => {
      Promise.resolve(guard(req, {} as Response, (err?: unknown) => (err ? reject(err) : resolve()))).catch(reject);
    });
  }
};
