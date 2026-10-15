import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessions, useSignOutEverywhere } from '../hooks/useProfile';
import { ConfirmButton } from './ConfirmButton';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday". */
const timeAgo = (iso: string, now = Date.now()): string => {
  const elapsed = now - new Date(iso).getTime();
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return relative.format(-Math.floor(elapsed / ms), unit);
  }
  return 'just now';
};

/** Every browser signed in to this account, docs/design/profile.png. */
export function SessionsCard() {
  const sessions = useSessions();
  const signOutEverywhere = useSignOutEverywhere();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Every browser or device signed in to this account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {sessions.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : sessions.isError ? (
          <p className="text-sm text-muted-foreground">Sessions could not be loaded.</p>
        ) : (
          <ul className="space-y-4">
            {sessions.data.map((session) => (
              <li key={session.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{session.device}</span>
                  {session.current && <Badge>This device</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[session.ip, `Active ${timeAgo(session.lastActiveAt)}`, `Signed in ${timeAgo(session.signedInAt)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
        <ConfirmButton
          variant="destructive"
          title="Sign out everywhere?"
          description="Every browser and device signed in to this account is signed out right away, this one included."
          confirmLabel="Sign out everywhere"
          onConfirm={() => signOutEverywhere.mutate()}
          disabled={signOutEverywhere.isPending}
        >
          Sign out everywhere
        </ConfirmButton>
      </CardContent>
    </Card>
  );
}
