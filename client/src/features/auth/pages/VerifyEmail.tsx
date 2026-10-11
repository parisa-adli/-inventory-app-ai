import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { getApiError } from '@/lib/apiError';
import { useAuthUser, useVerifyEmail } from '../hooks/useAuth';

/** Landing page of an emailed link (email verification or Telegram link). Works signed in or out. */
export default function VerifyEmail() {
  const { token = '' } = useParams();
  const { data: user } = useAuthUser();
  const { mutate, isPending, isSuccess, isError, error, data } = useVerifyEmail();

  // The link is single-use and StrictMode runs effects twice in dev: fire exactly once
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    mutate(token);
  }, [mutate, token]);

  const code = isError ? getApiError(error).code : null;
  const home = user ? '/' : '/login';

  // One landing page for both emailed links; the server says which one was consumed
  const linkedTelegram = data?.type === 'link-telegram';

  return (
    <div className="space-y-4" aria-live="polite">
      <h1 className="text-lg font-semibold">
        {isSuccess
          ? linkedTelegram
            ? 'Telegram link'
            : 'Email verification'
          : code === 'TOKEN_EXPIRED'
            ? 'Link expired'
            : 'Email link'}
      </h1>

      {!isSuccess && !isError && <p className="text-sm text-muted-foreground">Checking your link…</p>}
      {isPending && <span className="sr-only">Loading</span>}

      {isSuccess && (
        <>
          <p className="text-sm text-muted-foreground">
            {linkedTelegram
              ? 'Your Telegram account is linked. You can now sign in with Telegram.'
              : 'Your email address is verified.'}{' '}
            {user ? 'You can continue.' : 'Sign in to continue.'}
          </p>
          <Button asChild className="w-full">
            <Link to={home}>{user ? 'Continue' : 'Sign in'}</Link>
          </Button>
        </>
      )}

      {code === 'TOKEN_EXPIRED' && (
        <>
          <p className="text-sm text-muted-foreground">
            This link has expired.{' '}
            {user
              ? 'You can request a new one.'
              : 'Sign in and we can send you a new one.'}
          </p>
          <Button asChild className="w-full">
            <Link to={user ? '/verify-email' : '/login'}>{user ? 'Send a new link' : 'Sign in'}</Link>
          </Button>
        </>
      )}

      {isError && code !== 'TOKEN_EXPIRED' && (
        <>
          <p className="text-sm text-muted-foreground">
            {code === 'INVALID_TOKEN'
              ? 'This link is invalid or has already been used.'
              : getApiError(error).message}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to={home}>{user ? 'Back to the app' : 'Go to sign in'}</Link>
          </Button>
        </>
      )}
    </div>
  );
}
