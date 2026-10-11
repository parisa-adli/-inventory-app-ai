import { Navigate, Outlet, useLocation } from 'react-router';
import { ACCOUNT_STATUS, USER_ROLES, type AccountStatus } from '@inventory/shared';
import { resolveLandingRoute } from '../landing';
import { useAuthUser } from '../hooks/useAuth';

interface LocationState {
  from?: string;
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
      <div className="size-8 animate-spin rounded-full border-4 border-border border-t-primary" />
    </div>
  );
}

/** Logged-out pages (login, register, forgot password). Logged-in users are sent where they belong. */
export function PublicOnly() {
  const { data: user, isPending } = useAuthUser();
  const location = useLocation();

  if (isPending) return <FullScreenSpinner />;
  if (user) return <Navigate to={resolveLandingRoute(user, (location.state as LocationState | null)?.from)} replace />;
  return <Outlet />;
}

/** The app shell: active users only. Everyone else is routed by their state. */
export function RequireActive() {
  const { data: user, isPending } = useAuthUser();
  const location = useLocation();

  if (isPending) return <FullScreenSpinner />;
  if (!user) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" state={{ from } satisfies LocationState} replace />;
  }
  if (!user.emailVerified || user.status !== ACCOUNT_STATUS.ACTIVE) {
    return <Navigate to={resolveLandingRoute(user)} replace />;
  }
  return <Outlet />;
}

/** Admin-only routes; goes inside RequireActive. */
export function RequireAdmin() {
  const { data: user } = useAuthUser();
  if (user?.role !== USER_ROLES.ADMIN) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** The pending / rejected screens: only reachable while the account really is in that status. */
export function RequireStatus({ status }: { status: AccountStatus }) {
  const { data: user, isPending } = useAuthUser();

  if (isPending) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified || user.status !== status) return <Navigate to={resolveLandingRoute(user)} replace />;
  return <Outlet />;
}

/** The "verify your email" screen: only for a signed-in user whose address is not verified yet. */
export function RequireUnverified() {
  const { data: user, isPending } = useAuthUser();

  if (isPending) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to={resolveLandingRoute(user)} replace />;
  return <Outlet />;
}
