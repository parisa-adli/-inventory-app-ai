import { data, redirect, type MiddlewareFunction } from 'react-router';
import { ACCOUNT_STATUS, hasPermission, type AuthUser, type Permission } from '@inventory/shared';
import { queryClient } from '@/app/queryClient';
import { meQuery } from './hooks/useAuth';
import { loginRedirect, resolveLandingRoute, safeNext } from './landing';

/*
 * Route middleware: each guard runs before its routes render, so nobody sees a screen they are about
 * to be sent away from. A route using one of these needs a `loader` (even `() => null`): client
 * middleware only runs on a navigation that has a loader to call. These are UX only; the server's
 * guards (`can(...)` in server/src/middleware/guards.ts) remain the real boundary.
 */

/** Cache first; a stale entry is used immediately and refetched in the background. */
const getMe = () => queryClient.ensureQueryData({ ...meQuery, revalidateIfStale: true });

const hasGate = (user: AuthUser) => !user.emailVerified || user.status !== ACCOUNT_STATUS.ACTIVE;

/** Guest pages (sign in, sign up, forgot password). A signed-in user goes to their landing route. */
export const requireGuest: MiddlewareFunction = async ({ request }) => {
  const user = await getMe();
  if (user) throw redirect(resolveLandingRoute(user, safeNext(new URL(request.url))));
};

/** The app shell: a signed-in user with no gate. A guest goes to /login?next=, a gated user to their gate screen. */
export const requireSignedIn: MiddlewareFunction = async ({ request }) => {
  const user = await getMe();
  if (!user) throw redirect(loginRedirect(new URL(request.url)));
  if (hasGate(user)) throw redirect(resolveLandingRoute(user));
};

/** A gate screen: only while that gate really applies. Anyone else is sent where they belong. */
export const requireGate =
  (applies: (user: AuthUser) => boolean): MiddlewareFunction =>
  async () => {
    const user = await getMe();
    if (!user) throw redirect('/login');
    if (!applies(user)) throw redirect(resolveLandingRoute(user));
  };

/**
 * A page that needs `permission` (ROLE_PERMISSIONS in @inventory/shared), inside requireSignedIn.
 * Anyone else gets a 403 that the route's errorElement renders inside the shell, keeping the URL.
 * It is thrown after next(): an error thrown before it would bubble to the shell's own boundary and
 * replace the whole shell.
 */
export const requirePermission =
  (permission: Permission): MiddlewareFunction =>
  async (_args, next) => {
    const user = await getMe();
    await next();
    if (!user || !hasPermission(user.role, permission)) throw data(null, { status: 403 });
  };
