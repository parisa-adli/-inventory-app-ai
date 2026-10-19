import type { AdminUser } from '@inventory/shared';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { RoleBadge, UserEmail, UserStatus, UserTelegram } from './UserBadges';
import { UserRowMenu, type UserMenuHandlers } from './UserRowMenu';

const lastLogin = (user: AdminUser) => (user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never');

/** The All tab: every account with its sign-in methods, role and status, and the "…" menu per row. */
export function AllUsersTable({ users, actions }: { users: AdminUser[]; actions: UserMenuHandlers }) {
  return (
    <>
      <ul className="space-y-3 sm:hidden" aria-label="Users">
        {users.map((user) => (
          <li key={user.id}>
            <AllUserCard user={user} actions={actions} />
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>
                  <UserEmail user={user} />
                </TableCell>
                <TableCell>
                  <UserTelegram user={user} />
                </TableCell>
                <TableCell>
                  <RoleBadge role={user.role} />
                </TableCell>
                <TableCell className="max-w-56 whitespace-normal">
                  <UserStatus user={user} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-muted-foreground">{lastLogin(user)}</TableCell>
                <TableCell className="text-right">
                  <UserRowMenu user={user} {...actions} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** One account on a phone: the row's cells, with the "…" menu in the card header. */
function AllUserCard({ user, actions }: { user: AdminUser; actions: UserMenuHandlers }) {
  const titleId = `user-card-${user.id}`;
  return (
    <Card className="gap-4" role="article" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId} className="break-words">
          {user.name}
        </CardTitle>
        <CardAction>
          <UserRowMenu user={user} {...actions} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <UserEmail user={user} />
        <div className="flex flex-wrap items-start gap-2">
          <RoleBadge role={user.role} />
          <UserStatus user={user} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Telegram</dt>
          <dd>
            <UserTelegram user={user} />
          </dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{formatDate(user.createdAt)}</dd>
          <dt className="text-muted-foreground">Last login</dt>
          <dd className={user.lastLoginAt ? undefined : 'text-muted-foreground'}>{lastLogin(user)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
