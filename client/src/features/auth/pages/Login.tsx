import { Link } from 'react-router';
import { AuthMethodTabs } from '../components/AuthMethodTabs';
import { PasswordLoginForm } from '../components/PasswordLoginForm';
import { TelegramAuthPanel } from '../components/TelegramAuthPanel';

export default function Login() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <AuthMethodTabs email={<PasswordLoginForm />} telegram={<TelegramAuthPanel />} />
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
