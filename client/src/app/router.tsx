import { Navigate, Outlet, Route, Routes } from 'react-router';
import { ACCOUNT_STATUS } from '@inventory/shared';
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';
import {
  PublicOnly,
  RequireActive,
  RequireAdmin,
  RequireStatus,
} from '@/features/auth/components/guards';
import AwaitingApproval from '@/features/auth/pages/AwaitingApproval';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import Login from '@/features/auth/pages/Login';
import Register from '@/features/auth/pages/Register';
import Rejected from '@/features/auth/pages/Rejected';
import ResetPassword from '@/features/auth/pages/ResetPassword';
import VerifyEmail from '@/features/auth/pages/VerifyEmail';
import Dashboard from '@/features/dashboard/pages/Dashboard';

const AuthShell = () => (
  <AuthLayout>
    <Outlet />
  </AuthLayout>
);

const AppShell = () => (
  <AppLayout>
    <Outlet />
  </AppLayout>
);

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public: logged-in users are redirected to where they belong */}
      <Route element={<PublicOnly />}>
        <Route element={<AuthShell />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
      </Route>

      {/* Emailed links work whether or not the visitor is logged in */}
      <Route element={<AuthShell />}>
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
      </Route>

      {/* Pending / rejected screens */}
      <Route element={<AuthShell />}>
        <Route element={<RequireStatus status={ACCOUNT_STATUS.PENDING} />}>
          <Route path="/awaiting-approval" element={<AwaitingApproval />} />
        </Route>
        <Route element={<RequireStatus status={ACCOUNT_STATUS.REJECTED} />}>
          <Route path="/rejected" element={<Rejected />} />
        </Route>
      </Route>

      {/* App shell: active users only */}
      <Route element={<RequireActive />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          {/* Admin-only group; the Users page arrives with Part D */}
          <Route element={<RequireAdmin />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
