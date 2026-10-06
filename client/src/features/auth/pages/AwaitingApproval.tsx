import { Button } from '@/components/ui/button';
import { useAuthUser, useLogout, useResendVerification } from '../hooks/useAuth';

export default function AwaitingApproval() {
  const { data: user } = useAuthUser();
  const logout = useLogout();
  const resend = useResendVerification();

  return (
    <div className="space-y-4 text-center">
      <h2 className="text-2xl font-bold">Awaiting approval</h2>
      <p className="text-gray-600">
        Your account is waiting for an administrator to approve it. You will have access as soon as that happens.
      </p>
      {user && !user.emailVerified && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
          <p>
            Your email address is not verified yet. An administrator can only approve verified accounts. Use the
            link we emailed to <strong>{user.email}</strong>.
          </p>
          <Button variant="outline" size="sm" disabled={resend.isPending} onClick={() => resend.mutate()}>
            {resend.isPending ? 'Sending…' : 'Resend verification email'}
          </Button>
        </div>
      )}
      <Button variant="outline" className="w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Log out
      </Button>
    </div>
  );
}
