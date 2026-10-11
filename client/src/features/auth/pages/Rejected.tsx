import { Button } from '@/components/ui/button';
import { useLogout } from '../hooks/useAuth';

export default function Rejected() {
  const logout = useLogout();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Account not active</h1>
      <p className="text-sm text-muted-foreground">
        Your account has been rejected or revoked. Contact an administrator if you think this is a mistake.
      </p>
      <Button variant="outline" className="w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Log out
      </Button>
    </div>
  );
}
