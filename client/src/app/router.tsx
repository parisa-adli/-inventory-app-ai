import { createBrowserRouter, Navigate } from 'react-router';
import { ACCOUNT_STATUS, PERMISSIONS } from '@inventory/shared';
import { AuthShell } from './layouts/AuthLayout';
import AppLayout, { AppShell } from './layouts/AppLayout';
import AppSkeleton from './layouts/AppSkeleton';
import NotFound from './layouts/NotFound';
import RouteError from './layouts/RouteError';
import { APP_BASE, APP_HOME } from './paths';
import { NoAccessBoundary } from '@/features/auth/components/NoAccess';
import { requireGate, requireGuest, requirePermission, requireSignedIn } from '@/features/auth/routeGuards';
import AwaitingApproval from '@/features/auth/pages/AwaitingApproval';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import Login from '@/features/auth/pages/Login';
import Register from '@/features/auth/pages/Register';
import Rejected from '@/features/auth/pages/Rejected';
import ResetPassword from '@/features/auth/pages/ResetPassword';
import VerifyEmail from '@/features/auth/pages/VerifyEmail';
import VerifyEmailPending from '@/features/auth/pages/VerifyEmailPending';
import Dashboard from '@/features/dashboard/pages/Dashboard';
import Users from '@/features/users/pages/Users';

// Client middleware only runs on a navigation that has a loader to call, so every guarded route has one
const runGuards = () => null;

export const router = createBrowserRouter([
  {
    HydrateFallback: AppSkeleton,
    ErrorBoundary: RouteError,
    children: [
      // Guest pages: a signed-in user is sent to their landing route (or ?next=)
      {
        middleware: [requireGuest],
        loader: runGuards,
        Component: AuthShell,
        children: [
          { path: '/login', Component: Login },
          { path: '/register', Component: Register },
          { path: '/forgot-password', Component: ForgotPassword },
        ],
      },

      // Emailed links work for a guest and a signed-in user alike
      {
        Component: AuthShell,
        children: [
          { path: '/verify-email/:token', Component: VerifyEmail },
          { path: '/reset-password/:token', Component: ResetPassword },
        ],
      },

      // Gate screens: each only while its gate applies; an unverified email is handled first
      {
        Component: AuthShell,
        children: [
          {
            path: '/verify-email',
            middleware: [requireGate((user) => !user.emailVerified)],
            loader: runGuards,
            Component: VerifyEmailPending,
          },
          {
            path: '/awaiting-approval',
            middleware: [requireGate((user) => user.emailVerified && user.status === ACCOUNT_STATUS.PENDING)],
            loader: runGuards,
            Component: AwaitingApproval,
          },
          {
            path: '/rejected',
            middleware: [requireGate((user) => user.emailVerified && user.status === ACCOUNT_STATUS.REJECTED)],
            loader: runGuards,
            Component: Rejected,
          },
        ],
      },

      // App shell under /app: signed in with no gate. An unknown /app URL shows "not found" inside it
      {
        path: APP_BASE,
        middleware: [requireSignedIn],
        loader: runGuards,
        Component: AppShell,
        children: [
          { index: true, element: <Navigate to={APP_HOME} replace /> },
          { path: 'dashboard', Component: Dashboard },
          {
            middleware: [requirePermission(PERMISSIONS.USERS_MANAGE)],
            loader: runGuards,
            ErrorBoundary: NoAccessBoundary,
            children: [{ path: 'users', Component: Users }],
          },
          { path: '*', Component: NotFound },
        ],
      },

      // The root goes to the app, whose guard sends a guest to /login
      { path: '/', element: <Navigate to={APP_HOME} replace /> },

      // Any other unknown URL: "not found" inside the shell, behind the same guard. A leaf route, since an
      // index child under '*' would also match '/' and outrank the redirect above
      {
        path: '*',
        middleware: [requireSignedIn],
        loader: runGuards,
        element: (
          <AppLayout>
            <NotFound />
          </AppLayout>
        ),
      },
    ],
  },
]);
