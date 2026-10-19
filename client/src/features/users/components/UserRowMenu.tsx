import { MoreHorizontal } from 'lucide-react';
import { ACCOUNT_STATUS, USER_ROLES, type AdminUser, type UserRole } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROLE_LABELS } from '../roles';
import type { UserActionHandlers } from './UserActions';

/** The row actions plus what only the All tab's menu offers. Confirmations are opened by the page. */
export interface UserMenuHandlers extends UserActionHandlers {
  onChangeRole: (user: AdminUser, role: UserRole) => void;
  onIssueTempPassword: (user: AdminUser) => void;
  onUnlinkTelegram: (user: AdminUser) => void;
}

const DESTRUCTIVE_ITEM = 'text-destructive focus:bg-destructive/10 focus:text-destructive';

/**
 * The All tab's "…" menu for one account. Status: Activate + Reject (pending), Reject (active, a revoke)
 * or Reactivate (rejected). Then the role switch, and under Credentials a temporary password and, when
 * linked, Unlink Telegram. Your own row never offers rejecting or demoting yourself (the server refuses).
 */
export function UserRowMenu({ user, ...actions }: UserMenuHandlers & { user: AdminUser }) {
  const isMe = user.id === actions.meId;
  const otherRole: UserRole = user.role === USER_ROLES.ADMIN ? USER_ROLES.STAFF : USER_ROLES.ADMIN;
  const demotesMe = isMe && user.role === USER_ROLES.ADMIN;
  const unverifiedHint = !user.emailVerified && (
    <span className="ml-auto text-xs text-muted-foreground">Email unverified</span>
  );

  const statusItems = [];
  if (user.status === ACCOUNT_STATUS.PENDING) {
    statusItems.push(
      <DropdownMenuItem
        key="activate"
        disabled={!user.emailVerified || actions.pending.activate}
        onSelect={() => actions.onActivate(user)}
      >
        Activate
        {unverifiedHint}
      </DropdownMenuItem>
    );
  }
  if (user.status === ACCOUNT_STATUS.REJECTED) {
    statusItems.push(
      <DropdownMenuItem
        key="reactivate"
        disabled={!user.emailVerified || actions.pending.reactivate}
        onSelect={() => actions.onReactivate(user)}
      >
        Reactivate
        {unverifiedHint}
      </DropdownMenuItem>
    );
  }
  if (user.status !== ACCOUNT_STATUS.REJECTED && !isMe) {
    statusItems.push(
      <DropdownMenuItem key="reject" className={DESTRUCTIVE_ITEM} onSelect={() => actions.onReject(user)}>
        Reject
      </DropdownMenuItem>
    );
  }

  const hasStatusSection = statusItems.length > 0 || !demotesMe;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${user.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {hasStatusSection && (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Status</DropdownMenuLabel>
        )}
        {statusItems}
        {!demotesMe && (
          <DropdownMenuItem onSelect={() => actions.onChangeRole(user, otherRole)}>
            Make {ROLE_LABELS[otherRole].toLowerCase()}
          </DropdownMenuItem>
        )}
        {hasStatusSection && <DropdownMenuSeparator />}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Credentials</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => actions.onIssueTempPassword(user)}>Issue temporary password</DropdownMenuItem>
        {user.telegramLinked && (
          <DropdownMenuItem className={DESTRUCTIVE_ITEM} onSelect={() => actions.onUnlinkTelegram(user)}>
            Unlink Telegram
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
