import { useState } from 'react';
import { ACCOUNT_STATUS, USERS_PAGE_SIZE_DEFAULT, type AdminUser } from '@inventory/shared';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useActivateUser, useRejectUser, useUsers } from '../hooks/useUsers';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** Admin-only. Pending accounts, to activate or reject. */
export default function Users() {
  const [page, setPage] = useState(1);
  const [toReject, setToReject] = useState<AdminUser | null>(null);
  const users = useUsers({ status: ACCOUNT_STATUS.PENDING, page, limit: USERS_PAGE_SIZE_DEFAULT });
  const activate = useActivateUser();
  const reject = useRejectUser();

  const data = users.data;
  // Handling the last user on a page would leave that page empty: step back to the previous one
  const afterHandled = {
    onSuccess: () => {
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
    },
  };

  return (
    <div className="space-y-4 px-4 sm:px-0">
      <div>
        <h1 className="text-xl font-semibold">Pending users</h1>
        <p className="text-sm text-muted-foreground">
          Activate accounts once their email address is verified, or reject them.
        </p>
      </div>

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
          No users are waiting for approval.
        </p>
      )}

      {data && data.items.length > 0 && (
        <div className="rounded-md border bg-white">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Email status</TableHead>
                  <TableHead>Signed up</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.emailVerified ? (
                        <Badge variant="secondary">Verified</Badge>
                      ) : (
                        <Badge variant="outline">Not verified</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {user.emailVerified ? (
                          <Button
                            size="sm"
                            disabled={activate.isPending}
                            onClick={() => activate.mutate(user.id, afterHandled)}
                          >
                            Activate
                          </Button>
                        ) : (
                          <Tooltip>
                            {/* A disabled button swallows pointer events, so the span carries the tooltip */}
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button size="sm" disabled aria-label={`Activate ${user.name}`}>
                                  Activate
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              This user has not verified their email address yet.
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reject.isPending}
                          onClick={() => setToReject(user)}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages} · {data.total} users
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={toReject !== null} onOpenChange={(open: boolean) => !open && setToReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {toReject?.name}?</DialogTitle>
            <DialogDescription>
              They will see a "not approved" screen the next time they open the app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToReject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => {
                if (toReject) {
                  reject.mutate(toReject.id, {
                    ...afterHandled,
                    onSettled: () => setToReject(null),
                  });
                }
              }}
            >
              Reject user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
