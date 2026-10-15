import { useAuthUser } from '@/features/auth/hooks/useAuth';
import { AccountCard } from '../components/AccountCard';
import { SessionsCard } from '../components/SessionsCard';
import { SignInMethodsCard } from '../components/SignInMethodsCard';

/** The signed-in user's own account: name, sign-in methods and sessions (docs/design/profile.png). */
export default function Profile() {
  // The route guards only render this page for a signed-in user, so `me` is cached
  const { data: user } = useAuthUser();
  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <AccountCard user={user} />
      <SignInMethodsCard user={user} />
      <SessionsCard />
    </div>
  );
}
