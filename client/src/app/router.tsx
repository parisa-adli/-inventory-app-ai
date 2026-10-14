import { createBrowserRouter, Navigate } from 'react-router';
import { ACCOUNT_STATUS, USER_ROLES } from '@inventory/shared';
import { AuthShell } from './layouts/AuthLayout';
import { AppShell } from './layouts/AppLayout';
import AppSkeleton from './layouts/AppSkeleton';
import RouteError from './layouts/RouteError';
import { NoAccessBoundary } from '@/features/auth/components/NoAccess';
import { requireGate, requireGuest, requireRole, requireSignedIn } from '@/features/auth/routeGuards';
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

      // App shell: signed in with no gate. Unknown URLs live here too, so a guest typo goes to /login?next=
      {
        middleware: [requireSignedIn],
        loader: runGuards,
        Component: AppShell,
        children: [
          { path: '/', Component: Dashboard },
          {
            middleware: [requireRole(USER_ROLES.ADMIN)],
            loader: runGuards,
            ErrorBoundary: NoAccessBoundary,
            children: [{ path: '/users', Component: Users }],
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
