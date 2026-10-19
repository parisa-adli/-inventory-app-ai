import { useEffect, useState } from 'react';
import { ACCOUNT_STATUS, type AdminUser } from '@inventory/shared';
import { useAuthUser } from '@/features/auth/hooks/useAuth';
import { Pager } from '@/components/Pager';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/format';
import { AllUsersTable } from '../components/AllUsersTable';
import { CredentialDialogs, type CredentialAction } from '../components/CredentialDialogs';
import { PendingCountBadge } from '../components/PendingCountBadge';
import { EmailVerification, RoleBadge } from '../components/UserBadges';
import { UserActions, type UserActionHandlers } from '../components/UserActions';
import { UserCard } from '../components/UserCard';
import type { UserMenuHandlers } from '../components/UserRowMenu';
import { UsersToolbar } from '../components/UsersToolbar';
import { ALL_OPTION, useUserListParams, type UsersTab } from '../hooks/useUserListParams';
import {
  useActivateUser,
  useChangeRole,
  useReactivateUser,
  useRejectUser,
  useRevokeUser,
  useUsers,
} from '../hooks/useUsers';

// In tab order: All comes first and is the default
const VIEWS: Record<UsersTab, { tab: string; title: string; hint: string; empty: string }> = {
  [ALL_OPTION]: {
    tab: 'All Users',
    title: 'All users',
    hint: "Everyone with an account. Change a user's status, role and sign-in methods from their row's menu.",
    empty: 'No users yet.',
  },
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

/** The confirmation for rejecting a pending user or revoking an active one (the same server transition). */
const CONFIRM_COPY = {
  reject: {
    verb: 'Reject',
    description: 'They will see a "not approved" screen the next time they open the app.',
    label: 'Reject user',
    busy: 'Rejecting…',
  },
  revoke: {
    verb: 'Revoke',
    description: 'They lose access on their next request and their sessions end. You can reactivate them later.',
    label: 'Revoke user',
    busy: 'Revoking…',
  },
};

/**
 * Admin-only. Every account with its menu (All), pending users to activate or reject, active users to revoke,
 * rejected users to reactivate.
 */
export default function Users() {
  const list = useUserListParams();
  const { status, page, setPage } = list;
  // Confirmed for both reject (pending) and revoke (active): the same server transition
  const [toReject, setToReject] = useState<AdminUser | null>(null);
  const [credentialAction, setCredentialAction] = useState<CredentialAction | null>(null);
  const users = useUsers(list.params);
  const me = useAuthUser().data;
  const activate = useActivateUser();
  const reject = useRejectUser();
  const revoke = useRevokeUser();
  const reactivate = useReactivateUser();
  const changeRole = useChangeRole();
  const view = VIEWS[status];
  const revoking = toReject?.status === ACCOUNT_STATUS.ACTIVE;
  const confirmMutation = revoking ? revoke : reject;
  const confirmCopy = CONFIRM_COPY[revoking ? 'revoke' : 'reject'];

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

  const menuActions: UserMenuHandlers = {
    ...actions,
    onChangeRole: (user, role) => changeRole.mutate({ id: user.id, role }),
    onIssueTempPassword: (user) => setCredentialAction({ kind: 'temp-password', user }),
    onUnlinkTelegram: (user) => setCredentialAction({ kind: 'unlink-telegram', user }),
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

      <Tabs value={status} onValueChange={(value: string) => list.setStatus(value as UsersTab)}>
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

      {data && data.items.length > 0 && status === ALL_OPTION && <AllUsersTable users={data.items} actions={menuActions} />}

      {data && data.items.length > 0 && status !== ALL_OPTION && (
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
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <EmailVerification verified={user.emailVerified} />
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

      {/* Same AlertDialog as the catalog's delete confirmation (DeleteRecordDialog) */}
      <AlertDialog open={toReject !== null} onOpenChange={(open: boolean) => !open && setToReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmCopy.verb} {toReject?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
              {confirmMutation.isPending ? confirmCopy.busy : confirmCopy.label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CredentialDialogs action={credentialAction} onClose={() => setCredentialAction(null)} />
    </div>
  );
}
