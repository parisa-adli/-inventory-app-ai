import type { RequestHandler } from 'express';
import { USER_ROLES, type UserRole } from '@inventory/shared';
import { requireActive } from './requireActive.js';
import { requireAuth } from './requireAuth.js';
import { requirePasswordChanged } from './requirePasswordChanged.js';
import { requireRole } from './requireRole.js';
import { requireVerified } from './requireVerified.js';

// Routes spread one of these (`router.get('/', ...authenticated, handler)`) instead of chaining guards by hand.

/**
 * A session only. For self-service routes that gated users must still reach: /auth/me,
 * resend-verification, change-email and change-password.
 */
export const signedIn: RequestHandler[] = [requireAuth];

/** Verified, active, not on a temporary password: every data route (any role). */
export const authenticated: RequestHandler[] = [requireAuth, requireVerified, requireActive, requirePasswordChanged];

/** `authenticated` plus one of `roles`. */
export const withRole = (...roles: UserRole[]): RequestHandler[] => [...authenticated, requireRole(...roles)];

/** Admin-only routes (PRD §2: user management, archive/delete products, category/supplier mutations). */
export const adminOnly: RequestHandler[] = withRole(USER_ROLES.ADMIN);
