import { Button } from '@/components/ui/button';
import { useLogout } from '../hooks/useAuth';

/** Reached only by verified, pending users: an unverified one is sent to /verify-email first. */
export default function AwaitingApproval() {
  const logout = useLogout();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Awaiting approval</h1>
      <p className="text-sm text-muted-foreground">
        Your account is waiting for an administrator to approve it. You will have access as soon as that happens.
      </p>
      <Button variant="outline" className="w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Log out
      </Button>
    </div>
  );
}
