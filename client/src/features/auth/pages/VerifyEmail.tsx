import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuthUser, useVerifyEmail } from '../hooks/useAuth';

export default function VerifyEmail() {
  const { token = '' } = useParams();
  const { data: user } = useAuthUser();
  const { mutate, isPending, isSuccess, isError } = useVerifyEmail();

  // The link is single-use and StrictMode runs effects twice in dev: fire exactly once
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    mutate(token);
  }, [mutate, token]);

  return (
    <div className="space-y-4 text-center">
      <h2 className="text-2xl font-bold">Email verification</h2>
      {(isPending || (!isSuccess && !isError)) && <p className="text-gray-600">Verifying your email…</p>}
      {isSuccess && (
        <>
          <p className="text-gray-600">Your email address is verified.</p>
          <Button asChild className="w-full">
            <Link to={user ? '/' : '/login'}>{user ? 'Continue' : 'Go to log in'}</Link>
          </Button>
        </>
      )}
      {isError && (
        <>
          <p className="text-gray-600">This verification link is invalid or has expired.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to={user ? '/' : '/login'}>{user ? 'Back to the app' : 'Go to log in'}</Link>
          </Button>
        </>
      )}
    </div>
  );
}
