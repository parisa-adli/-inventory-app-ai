import { ACCOUNT_STATUS, type AdminUser } from '@inventory/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { ROLE_LABELS } from '../roles';
import { EmailStatusBadge } from './EmailStatusBadge';
import { UserActions, type UserActionHandlers } from './UserActions';

/** One account on a phone: what the table row shows, with the action buttons at full width below. */
export function UserCard({ user, actions }: { user: AdminUser; actions: UserActionHandlers }) {
  const titleId = `user-card-${user.id}`;
  const awaitingVerification = user.status !== ACCOUNT_STATUS.ACTIVE && !user.emailVerified;
  return (
    <Card className="gap-4" role="article" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId} className="break-words">
          {user.name}
        </CardTitle>
        <p className="text-sm break-all text-muted-foreground">{user.email}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <EmailStatusBadge verified={user.emailVerified} />
          <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Signed up</dt>
          <dd>{formatDate(user.createdAt)}</dd>
          <dt className="text-muted-foreground">Last sign-in</dt>
          <dd className={user.lastLoginAt ? undefined : 'text-muted-foreground'}>
            {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
          </dd>
        </dl>
        {/* The disabled button's tooltip never opens on a tap, so the card says why */}
        {awaitingVerification && (
          <p className="text-xs text-muted-foreground">
            Can be {user.status === ACCOUNT_STATUS.REJECTED ? 'reactivated' : 'activated'} once they verify their
            email address.
          </p>
        )}
      </CardContent>
      <CardFooter className="grid auto-cols-fr grid-flow-col gap-2 empty:hidden">
        <UserActions user={user} {...actions} fullWidth />
      </CardFooter>
    </Card>
  );
}
