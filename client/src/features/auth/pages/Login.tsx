import { Link, useLocation } from 'react-router';
import { AuthMethodTabs } from '../components/AuthMethodTabs';
import { PasswordLoginForm } from '../components/PasswordLoginForm';
import { TelegramLoginPanel } from '../components/TelegramQrPanel';

export default function Login() {
  // Set by the reset-password page after a successful reset
  const notice = (useLocation().state as { notice?: string } | null)?.notice;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      {notice && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      )}
      <AuthMethodTabs email={<PasswordLoginForm />} telegram={<TelegramLoginPanel />} />
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
