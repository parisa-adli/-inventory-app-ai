import { Navigate, Outlet, useLocation } from 'react-router';
import { ACCOUNT_STATUS, USER_ROLES, type AccountStatus, type AuthUser } from '@inventory/shared';
import { useAuthUser } from '../hooks/useAuth';

interface LocationState {
  from?: string;
}

/** Where a logged-in user belongs, by account status. */
const homeFor = (user: AuthUser, from?: string): string => {
  if (user.status === ACCOUNT_STATUS.PENDING) return '/awaiting-approval';
  if (user.status === ACCOUNT_STATUS.REJECTED) return '/rejected';
  return from ?? '/';
};

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
    </div>
  );
}

/** Logged-out pages (login, register, forgot password). Logged-in users are sent where they belong. */
export function PublicOnly() {
  const { data: user, isPending } = useAuthUser();
  const location = useLocation();

  if (isPending) return <FullScreenSpinner />;
  if (user) return <Navigate to={homeFor(user, (location.state as LocationState | null)?.from)} replace />;
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
  if (user.status !== ACCOUNT_STATUS.ACTIVE) return <Navigate to={homeFor(user)} replace />;
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
  if (user.status !== status) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}
