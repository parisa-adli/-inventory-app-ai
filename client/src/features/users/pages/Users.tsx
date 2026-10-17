import { useEffect, useState } from 'react';
import { ACCOUNT_STATUS, type AccountStatus, type AdminUser } from '@inventory/shared';
import { useAuthUser } from '@/features/auth/hooks/useAuth';
import { Pager } from '@/components/Pager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/format';
import { EmailStatusBadge } from '../components/EmailStatusBadge';
import { PendingCountBadge } from '../components/PendingCountBadge';
import { UserActions, type UserActionHandlers } from '../components/UserActions';
import { UserCard } from '../components/UserCard';
import { UsersToolbar } from '../components/UsersToolbar';
import { useUserListParams } from '../hooks/useUserListParams';
import { useActivateUser, useReactivateUser, useRejectUser, useRevokeUser, useUsers } from '../hooks/useUsers';
import { ROLE_LABELS } from '../roles';

const VIEWS: Record<AccountStatus, { tab: string; title: string; hint: string; empty: string }> = {
  pending: {
    tab: 'Pending',
    title: 'Pending users',
    hint: 'Activate accounts once their email address is verified, or reject them.',
    empty: 'No users are waiting for approval.',
  },
  active: {
    tab: 'Active',
    title: 'Active users',
    hint: 'Revoke access for an account; it can be reactivated later.',
    empty: 'No active users.',
  },
  rejected: {
    tab: 'Rejected',
    title: 'Rejected users',
    hint: 'Rejected and revoked accounts. Reactivate one to let them sign in again.',
    empty: 'No rejected users.',
  },
};

/** Admin-only. Pending users to activate or reject, active users to revoke, rejected users to reactivate. */
export default function Users() {
  const list = useUserListParams();
  const { status, page, setPage } = list;
  // Confirmed for both reject (pending) and revoke (active): the same server transition
  const [toReject, setToReject] = useState<AdminUser | null>(null);
  const users = useUsers(list.params);
  const me = useAuthUser().data;
  const activate = useActivateUser();
  const reject = useRejectUser();
  const revoke = useRevokeUser();
  const reactivate = useReactivateUser();
  const view = VIEWS[status];
  const revoking = toReject?.status === ACCOUNT_STATUS.ACTIVE;
  const confirmMutation = revoking ? revoke : reject;

  const data = users.data;
  // Handling the last user on a page would leave that page empty: step back to the previous one
  const afterHandled = {
    onSuccess: () => {
      if (data && data.items.length === 1 && page > 1) setPage(page - 1, { replace: true });
    },
  };
  const actions: UserActionHandlers = {
    meId: me?.id,
    onActivate: (user) => activate.mutate(user.id, afterHandled),
    onReactivate: (user) => reactivate.mutate(user.id, afterHandled),
    onReject: setToReject,
    pending: {
      activate: activate.isPending,
      reactivate: reactivate.isPending,
      reject: reject.isPending,
      revoke: revoke.isPending,
    },
  };

  // A stale link or a change elsewhere left us past the last page: go to the last one that exists
  useEffect(() => {
    if (data && !users.isPlaceholderData && page > data.totalPages) setPage(data.totalPages, { replace: true });
  }, [data, users.isPlaceholderData, page, setPage]);

  return (
    <div className="space-y-4 px-4 sm:px-0">
      <div>
        <h1 className="text-xl font-semibold">{view.title}</h1>
        <p className="text-sm text-muted-foreground">{view.hint}</p>
      </div>

      <Tabs value={status} onValueChange={(value: string) => list.setStatus(value as AccountStatus)}>
        <TabsList>
          {Object.entries(VIEWS).map(([value, { tab }]) => (
            <TabsTrigger key={value} value={value}>
              {tab}
              {value === ACCOUNT_STATUS.PENDING && <PendingCountBadge className="ml-1.5" />}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <UsersToolbar list={list} />

      {users.isPending && <p className="text-sm text-muted-foreground" role="status">Loading users…</p>}
      {users.isError && (
        <p className="text-sm text-destructive" role="alert">
          Could not load users.{' '}
          <button className="underline" onClick={() => users.refetch()}>
            Try again
          </button>
        </p>
      )}

      {data && data.items.length === 0 && (
        <p className="rounded-md border bg-white p-6 text-center text-sm text-muted-foreground">
          {list.hasFilters ? 'No users match these filters.' : view.empty}
        </p>
      )}

      {data && data.items.length > 0 && (
        <TooltipProvider>
          <ul className="space-y-3 sm:hidden" aria-label="Users">
            {data.items.map((user) => (
              <li key={user.id}>
                <UserCard user={user} actions={actions} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email status</TableHead>
                  <TableHead>Signed up</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <EmailStatusBadge verified={user.emailVerified} />
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell className={user.lastLoginAt ? undefined : 'text-muted-foreground'}>
                      {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <UserActions user={user} {...actions} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}

      {data && data.items.length > 0 && <Pager meta={data} onPage={(next) => setPage(next)} />}

      <Dialog open={toReject !== null} onOpenChange={(open: boolean) => !open && setToReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {revoking ? 'Revoke' : 'Reject'} {toReject?.name}?
            </DialogTitle>
            <DialogDescription>
              {revoking
                ? 'They lose access on their next request and their sessions end. You can reactivate them later.'
                : 'They will see a "not approved" screen the next time they open the app.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToReject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmMutation.isPending}
              onClick={() => {
                if (toReject) {
                  confirmMutation.mutate(toReject.id, {
                    ...afterHandled,
                    onSettled: () => setToReject(null),
                  });
                }
              }}
            >
              {revoking ? 'Revoke user' : 'Reject user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
