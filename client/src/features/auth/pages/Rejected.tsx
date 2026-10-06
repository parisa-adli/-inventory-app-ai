import { Button } from '@/components/ui/button';
import { useLogout } from '../hooks/useAuth';

export default function Rejected() {
  const logout = useLogout();

  return (
    <div className="space-y-4 text-center">
      <h2 className="text-2xl font-bold">Account not active</h2>
      <p className="text-gray-600">
        Your account has been rejected or revoked. Contact an administrator if you think this is a mistake.
      </p>
      <Button variant="outline" className="w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Log out
      </Button>
    </div>
  );
}
