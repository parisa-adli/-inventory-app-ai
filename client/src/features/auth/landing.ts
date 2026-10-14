import { ACCOUNT_STATUS, type AuthUser } from '@inventory/shared';
import { APP_BASE, APP_HOME } from '@/app/paths';

/** Pages only a guest may see; a signed-in user is sent to their landing route instead. */
export const GUEST_ROUTES = ['/login', '/register', '/forgot-password'];

/** The gate screens, one per gate. */
export const GATE_ROUTES = ['/verify-email', '/rejected', '/awaiting-approval'];

/**
 * Where a signed-in user belongs. The first gate that applies wins: an unverified email, then a
 * rejected account, then a pending one (so a rejected user who never verified still lands on verify).
 * `next` is only honoured once no gate applies; pass it through `safeNext` first.
 */
export const resolveLandingRoute = (user: AuthUser, next?: string): string => {
  if (!user.emailVerified) return '/verify-email';
  if (user.status === ACCOUNT_STATUS.REJECTED) return '/rejected';
  if (user.status === ACCOUNT_STATUS.PENDING) return '/awaiting-approval';
  return next ?? APP_HOME;
};

/**
 * The `?next=` deep link from a URL, or undefined when it is missing or unsafe. Only a same-origin
 * path is accepted (a single leading "/", so not "//host" or "/\host"), and never a guest page or a
 * gate screen, which would only bounce again.
 */
export const safeNext = (url: URL): string | undefined => {
  const next = url.searchParams.get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return undefined;
  const target = new URL(next, url.origin);
  if (target.origin !== url.origin) return undefined;
  if ([...GUEST_ROUTES, ...GATE_ROUTES].includes(target.pathname)) return undefined;
  return target.pathname + target.search + target.hash;
};

/** Paths that just mean "the app", so remembering them adds nothing. */
const DEFAULT_LANDINGS = ['/', APP_BASE, `${APP_BASE}/`, APP_HOME];

/** The guest's way back in: /login, remembering the page they asked for. */
export const loginRedirect = (url: URL): string => {
  const next = url.pathname + url.search;
  return DEFAULT_LANDINGS.includes(next) ? '/login' : `/login?next=${encodeURIComponent(next)}`;
};
